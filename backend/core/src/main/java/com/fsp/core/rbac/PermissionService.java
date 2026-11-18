package com.fsp.core.rbac;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.tenant.Tenant;
import com.fsp.core.tenant.TenantRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Phase-0 scope rule:
 *  - role scope PLATFORM held on the platform root tenant reaches every tenant;
 *  - scope SUBTREE held on an ancestor tenant reaches all descendants;
 *  - scope TENANT reaches only the exact tenant;
 *  - scope EDGE is reserved (ignored in Phase-0).
 * Negative paths (denials, four-eyes blocks) are incident-logged at WARN (AGENTS.md §2c).
 */
@Slf4j
@Service
public class PermissionService {

    private final RbacRepository rbacRepository;
    private final RoleRepository roleRepository;
    private final TenantRepository tenantRepository;
    private final PermissionRepository permissionRepository;
    private final com.fsp.core.identity.PersonRepository personRepository;
    private final JdbcTemplate jdbc;

    public PermissionService(RbacRepository rbacRepository, RoleRepository roleRepository,
                             TenantRepository tenantRepository, PermissionRepository permissionRepository,
                             com.fsp.core.identity.PersonRepository personRepository, JdbcTemplate jdbc) {
        this.personRepository = personRepository;
        this.rbacRepository = rbacRepository;
        this.roleRepository = roleRepository;
        this.tenantRepository = tenantRepository;
        this.permissionRepository = permissionRepository;
        this.jdbc = jdbc;
    }

    /** Effective permission keys for the actor relative to a target tenant (chain-aware). */
    public Set<String> effectiveKeys(Actor actor, UUID targetTenantId) {
        requireActor(actor);
        Tenant target = tenantRepository.findById(targetTenantId)
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Tenant " + targetTenantId + " not found"));
        Set<UUID> chain = chainFor(actor, target);

        // Deactivated/removed persons hold NO permissions, even with a still-valid token
        String status = personRepository.findById(actor.personId()).map(p -> p.status).orElse(null);
        if (!"ACTIVE".equals(status)) {
            log.warn("permission_denied_inactive_person personId={} status={}", actor.personId(), status);
            return Set.of();
        }

        List<UserRole> assignments = rbacRepository.findByPersonId(actor.personId());
        if (assignments.isEmpty()) return Set.of();

        Set<String> keys = new HashSet<>();
        for (UUID roleId : assignments.stream().map(u -> u.roleId).distinct().toList()) {
            Role role = roleRepository.findById(roleId).orElse(null);
            if (role == null || !chain.contains(role.tenantId)) continue;
            if ("EDGE".equals(role.scope)) continue;
            keys.addAll(rbacRepository.permissionKeysForPerson(actor.personId()));
        }
        return keys;
    }

    private Set<UUID> chainFor(Actor actor, Tenant target) {
        Set<UUID> chain = new HashSet<>();
        for (String part : target.hierarchyPath.replaceFirst("^/", "").split("/")) {
            if (part.isBlank()) continue;
            try { chain.add(UUID.fromString(part)); } catch (IllegalArgumentException ignored) {}
        }
        chain.add(actor.activeTenantId());
        return chain;
    }

    /** Effective permission keys for a machine client relative to a target tenant (chain-aware).
     * A client grant applies when the grant's owner_tenant_id is the target tenant or an
     * ancestor of it (subtree reachability, same chain math as effectiveKeys). */
    public Set<String> effectiveKeysForClient(String clientId, UUID targetTenantId) {
        Tenant target = tenantRepository.findById(targetTenantId)
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Tenant " + targetTenantId + " not found"));
        Set<UUID> chain = new HashSet<>();
        for (String part : target.hierarchyPath.replaceFirst("^/", "").split("/")) {
            if (part.isBlank()) continue;
            try { chain.add(UUID.fromString(part)); } catch (IllegalArgumentException ignored) {}
        }
        chain.add(targetTenantId);

        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT owner_tenant_id, operation_or_permission FROM client_grants WHERE client_id = ?",
            clientId);

        Set<String> keys = new HashSet<>();
        for (Map<String, Object> row : rows) {
            UUID ownerTenantId = UUID.fromString(row.get("owner_tenant_id").toString());
            if (chain.contains(ownerTenantId)) {
                keys.add((String) row.get("operation_or_permission"));
            }
        }
        return keys;
    }

    public void requireClient(String clientId, String permission, UUID targetTenantId) {
        Set<String> keys = effectiveKeysForClient(clientId, targetTenantId);
        if (!keys.contains(permission)) {
            log.warn("client_permission_denied clientId={} targetTenant={} permission={}",
                clientId, targetTenantId, permission);
            throw ApiException.forbidden("CLIENT_PERMISSION_DENIED",
                "Client '%s' lacks permission '%s' at tenant %s".formatted(clientId, permission, targetTenantId));
        }
        log.debug("client_permission_granted clientId={} permission={} targetTenant={}",
            clientId, permission, targetTenantId);
    }

    /** Effective permission keys while acting as {@code targetTenantId} from {@code homeTenantId}.
     *  {@code holds} = permissions at the target ∪ permissions at the home tenant.
     *  {@code ceiling} = permissions of roles directly at the target tenant (no ancestor roles),
     *  which caps holds so acting can never escalate beyond what the target org's roles allow.
     */
    public Set<String> effectiveKeysForActing(Actor actor, UUID homeTenantId, UUID targetTenantId) {
        requireActor(actor);
        if (actor.personId() == null) {
            return Set.of();
        }
        // Holds at target + holds at home (actor copy with the right activeTenantId for chain math)
        Set<String> atTarget = effectiveKeys(
            new Actor(actor.personId(), actor.username(), targetTenantId, actor.type(), actor.clientId()),
            targetTenantId);
        Set<String> atHome = effectiveKeys(
            new Actor(actor.personId(), actor.username(), homeTenantId, actor.type(), actor.clientId()),
            homeTenantId);
        Set<String> holds = new HashSet<>(atTarget);
        holds.addAll(atHome);

        // Ceiling: roles directly at the target tenant (not ancestors)
        Set<String> ceiling = new HashSet<>();
        for (Role role : roleRepository.findByTenantId(targetTenantId)) {
            if ("EDGE".equals(role.scope)) continue;
            ceiling.addAll(rbacRepository.permissionKeysForRole(role.id));
        }

        holds.retainAll(ceiling);
        log.debug("act_as_keys personId={} home={} target={} holds={} ceiling={} result={}",
            actor.personId(), homeTenantId, targetTenantId, holds.size(), ceiling.size(), holds.size());
        return holds;
    }

    public void require(Actor actor, String permission, UUID targetTenantId) {
        Set<String> keys = effectiveKeys(actor, targetTenantId);
        if (!keys.contains(permission)) {
            log.warn("permission_denied personId={} activeTenant={} targetTenant={} permission={}",
                actor.personId(), actor.activeTenantId(), targetTenantId, permission);
            throw ApiException.forbidden("PERMISSION_DENIED",
                "Requires permission '%s' at tenant %s".formatted(permission, targetTenantId));
        }
        log.debug("permission_granted personId={} permission={} targetTenant={}",
            actor.personId(), permission, targetTenantId);
    }

    /** First satisfied permission wins (queue surfaces hold several review permissions). */
    public void requireAny(Actor actor, List<String> anyOf, UUID targetTenantId) {
        Set<String> keys = effectiveKeys(actor, targetTenantId);
        for (String permission : anyOf) {
            if (keys.contains(permission)) {
                log.debug("permission_granted personId={} permission={} targetTenant={}",
                    actor.personId(), permission, targetTenantId);
                return;
            }
        }
        log.warn("permission_denied personId={} activeTenant={} targetTenant={} anyOf={}",
            actor.personId(), actor.activeTenantId(), targetTenantId, anyOf);
        throw ApiException.forbidden("PERMISSION_DENIED",
            "Requires one of %s at tenant %s".formatted(anyOf, targetTenantId));
    }

    /** Four-eyes at person_id level: maker can never check their own request. */
    public void requireDistinctPerson(Actor checker, UUID makerId) {
        if (checker.personId().equals(makerId)) {
            log.warn("maker_cannot_approve personId={}", checker.personId());
            throw ApiException.forbidden("MAKER_CANNOT_APPROVE",
                "The person who submitted this operation cannot approve it (four-eyes at person_id)");
        }
    }

    public List<Permission> catalog() {
        List<Permission> out = new java.util.ArrayList<>();
        permissionRepository.findAll().forEach(out::add);
        out.sort((a, b) -> a.key.compareTo(b.key));
        return out;
    }

    private void requireActor(Actor actor) {
        if (actor == null) {
            throw ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        }
    }
}
