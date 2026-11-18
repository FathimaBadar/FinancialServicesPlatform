package com.fsp.core.rbac;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.approval.ApprovalRequestRepository;
import com.fsp.core.approval.ApprovalService;
import com.fsp.core.audit.AuditService;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.tenant.TenantRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Organization role governance (GAP-1): list / view roles, and STAGE create / update / delete.
 *
 * <p>Every write is four-eyes: the maker opens an {@link ApprovalRequest} (ROLE_CREATE |
 * ROLE_UPDATE | ROLE_DELETE) carrying the proposal; nothing changes until a different,
 * checker-flagged person holding {@code role.manage} approves it
 * ({@link RoleApprovalHandlers} → {@code apply*}). Grants live in {@code role_permissions}
 * — the table {@link PermissionService} actually reads.
 *
 * <p>Guards:
 * <ul>
 *   <li>{@code role.manage} on the role's organization (reads: {@code role.view} or {@code role.manage});
 *       a role of another organization is a concealed 404.</li>
 *   <li>No escalation: every key ADDED or REMOVED must be held by the maker — and again by the
 *       checker at apply time.</li>
 *   <li>Keys must exist in the permission catalog; role keys are {@code ^[A-Z][A-Z0-9_]{1,47}$},
 *       unique per organization.</li>
 *   <li>Optimistic: updates/deletes carry {@code expectedVersion}; the approval pins
 *       {@code baseVersion} and apply refuses a role that moved in between ({@code STALE_WRITE}).</li>
 *   <li>One open change per role ({@code ROLE_CHANGE_PENDING}); PLATFORM-scoped roles and the
 *       two anchor roles every organization is born with cannot be deleted ({@code ROLE_PROTECTED});
 *       a role still assigned to people cannot be deleted ({@code ROLE_IN_USE}).</li>
 * </ul>
 */
@Slf4j
@Service
public class RoleAdminService {

    static final String MANAGE = "role.manage";
    static final String VIEW = "role.view";
    private static final Pattern KEY = Pattern.compile("^[A-Z][A-Z0-9_]{1,47}$");
    private static final Set<String> ANCHOR_ROLES = Set.of(RoleTemplates.ADMIN_ROLE, RoleTemplates.CHECKER_ROLE);
    private static final Set<String> ROLE_OPS = Set.of(
        ApprovalRequest.OpType.ROLE_CREATE, ApprovalRequest.OpType.ROLE_UPDATE, ApprovalRequest.OpType.ROLE_DELETE);

    private final RoleRepository roles;
    private final RbacRepository rbac;
    private final RolePermissionRepository rolePermissions;
    private final PermissionRepository catalog;
    private final TenantRepository tenants;
    private final PermissionService permissions;
    private final ApprovalService approvals;
    private final ApprovalRequestRepository approvalRows;
    private final AuditService audit;
    private final OutboxService outbox;
    private final ObjectMapper mapper;

    public RoleAdminService(RoleRepository roles, RbacRepository rbac, RolePermissionRepository rolePermissions,
                            PermissionRepository catalog, TenantRepository tenants, PermissionService permissions,
                            ApprovalService approvals, ApprovalRequestRepository approvalRows,
                            AuditService audit, OutboxService outbox, ObjectMapper mapper) {
        this.roles = roles;
        this.rbac = rbac;
        this.rolePermissions = rolePermissions;
        this.catalog = catalog;
        this.tenants = tenants;
        this.permissions = permissions;
        this.approvals = approvals;
        this.approvalRows = approvalRows;
        this.audit = audit;
        this.outbox = outbox;
        this.mapper = mapper;
    }

    // ------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public List<RoleDtos.RoleView> list(UUID tenantId, Actor actor) {
        requireRead(actor, tenantId);
        Map<UUID, ApprovalRequest> pending = pendingByTarget(tenantId);
        List<RoleDtos.RoleView> out = new ArrayList<>();
        for (Role r : roles.findByTenantId(tenantId)) out.add(view(r, pending.get(r.id)));
        // creations still awaiting their checker (no row yet) — the maker sees what is in flight
        for (ApprovalRequest a : pending.values()) {
            if (!ApprovalRequest.OpType.ROLE_CREATE.equals(a.operationType)) continue;
            RoleDtos.RoleProposal p = proposal(a);
            out.add(new RoleDtos.RoleView(a.targetResourceId, tenantId, p.key(), p.name(), "TENANT", "PENDING_CREATE",
                sorted(p.permissionKeys()), 0, 0, false, a.id, a.operationType));
        }
        out.sort(Comparator.comparing(RoleDtos.RoleView::key));
        return out;
    }

    @Transactional(readOnly = true)
    public RoleDtos.RoleView get(UUID tenantId, UUID roleId, Actor actor) {
        requireRead(actor, tenantId);
        Role r = load(tenantId, roleId);
        return view(r, pendingByTarget(tenantId).get(r.id));
    }

    // ----------------------------------------------------------------- writes (maker)

    @Transactional
    public RoleDtos.RoleChange requestCreate(UUID tenantId, RoleDtos.CreateRole in, Actor actor) {
        requireManage(actor, tenantId);
        if (in == null) throw ApiException.badRequest("BODY_INVALID", "Request body required");
        String key = in.key() == null ? "" : in.key().trim().toUpperCase(Locale.ROOT);
        if (!KEY.matcher(key).matches()) {
            throw ApiException.badRequest("ROLE_KEY_INVALID",
                "Role key must be 2–48 characters: A–Z, 0–9 and '_', starting with a letter");
        }
        String name = requireName(in.name() == null || in.name().isBlank() ? key : in.name());
        boolean taken = roles.findByTenantId(tenantId).stream().anyMatch(r -> r.key.equals(key))
            || pendingByTarget(tenantId).values().stream()
                .anyMatch(a -> ApprovalRequest.OpType.ROLE_CREATE.equals(a.operationType) && key.equals(proposal(a).key()));
        if (taken) throw ApiException.conflict("ROLE_KEY_TAKEN", "Role key '%s' is already in use".formatted(key));
        List<String> keys = requireCatalogKeys(in.permissionKeys());
        requireHeld(actor, tenantId, new LinkedHashSet<>(keys), key);

        UUID roleId = UUID.randomUUID(); // reserved; the row is created only on approval
        RoleDtos.RoleProposal p = new RoleDtos.RoleProposal(key, name, keys, null);
        ApprovalRequest row = approvals.open(tenantId, ApprovalRequest.OpType.ROLE_CREATE, roleId, actor,
            "role-create:" + key + ":" + keys, json(p));
        record(actor.personId(), null, tenantId, "ROLE_CREATE_REQUESTED", roleId, null, p);
        log.info("role_create_requested tenant={} roleKey={} keys={} approvalId={} by={}",
            tenantId, key, keys.size(), row.id, actor.personId());
        return new RoleDtos.RoleChange(row.id, row.operationType, roleId, row.status);
    }

    @Transactional
    public RoleDtos.RoleChange requestUpdate(UUID tenantId, UUID roleId, RoleDtos.UpdateRole in, Actor actor) {
        requireManage(actor, tenantId);
        if (in == null) throw ApiException.badRequest("BODY_INVALID", "Request body required");
        Role r = load(tenantId, roleId);
        requireMutable(r, false);
        requireVersion(r, in.expectedVersion());
        requireNoPending(r);
        List<String> current = rbac.permissionKeysForRole(r.id);
        List<String> proposed = in.permissionKeys() == null ? current : requireCatalogKeys(in.permissionKeys());
        String name = in.name() == null ? r.name : requireName(in.name());
        Set<String> touched = diff(current, proposed);
        if (touched.isEmpty() && name.equals(r.name)) {
            throw ApiException.badRequest("ROLE_NO_CHANGE", "The proposal is identical to the current role");
        }
        requireHeld(actor, tenantId, touched, r.key);

        RoleDtos.RoleProposal p = new RoleDtos.RoleProposal(r.key, name, proposed, r.version);
        ApprovalRequest row = approvals.open(tenantId, ApprovalRequest.OpType.ROLE_UPDATE, r.id, actor,
            "role-update:" + r.key + ":" + proposed + ":v" + r.version, json(p));
        record(actor.personId(), null, tenantId, "ROLE_UPDATE_REQUESTED", r.id, snapshot(r, current), p);
        log.info("role_update_requested tenant={} role={} added={} removed={} approvalId={} by={}",
            tenantId, r.key, minus(proposed, current), minus(current, proposed), row.id, actor.personId());
        return new RoleDtos.RoleChange(row.id, row.operationType, r.id, row.status);
    }

    @Transactional
    public RoleDtos.RoleChange requestDelete(UUID tenantId, UUID roleId, Long expectedVersion, Actor actor) {
        requireManage(actor, tenantId);
        Role r = load(tenantId, roleId);
        requireMutable(r, true);
        requireVersion(r, expectedVersion);
        requireNoPending(r);
        requireUnassigned(r);
        List<String> current = rbac.permissionKeysForRole(r.id);
        requireHeld(actor, tenantId, new LinkedHashSet<>(current), r.key);

        RoleDtos.RoleProposal p = new RoleDtos.RoleProposal(r.key, r.name, List.of(), r.version);
        ApprovalRequest row = approvals.open(tenantId, ApprovalRequest.OpType.ROLE_DELETE, r.id, actor,
            "role-delete:" + r.key + ":v" + r.version, json(p));
        record(actor.personId(), null, tenantId, "ROLE_DELETE_REQUESTED", r.id, snapshot(r, current), p);
        log.info("role_delete_requested tenant={} role={} approvalId={} by={}", tenantId, r.key, row.id, actor.personId());
        return new RoleDtos.RoleChange(row.id, row.operationType, r.id, row.status);
    }

    // ----------------------------------------------------------------- apply (checker)

    /** Approved ROLE_CREATE: create the row + grants. The hold-what-you-grant rule was already
     * enforced on the maker at proposal time; the checker supplies four-eyes only. */
    @Transactional
    public void applyCreate(ApprovalRequest approval, Actor checker) {
        RoleDtos.RoleProposal p = proposal(approval);
        if (roles.findByTenantId(approval.tenantId).stream().anyMatch(r -> r.key.equals(p.key()))) {
            throw ApiException.conflict("ROLE_KEY_TAKEN", "Role key '%s' was taken meanwhile".formatted(p.key()));
        }
        List<String> keys = requireCatalogKeys(p.permissionKeys());
        Role r = new Role();
        r.id = approval.targetResourceId;
        r.tenantId = approval.tenantId;
        r.key = p.key();
        r.name = p.name();
        r.scope = "TENANT";
        roles.saveAndFlush(r);
        for (String k : keys) grant(r.id, k);
        record(approval.makerId, checker.personId(), approval.tenantId, "ROLE_CREATED", r.id, null, snapshot(r, keys));
        log.info("role_create_applied tenant={} role={} keys={} approvalId={} checker={}",
            approval.tenantId, r.key, keys.size(), approval.id, checker.personId());
    }

    /** Approved ROLE_UPDATE: replace grants with the proposal (version-pinned). */
    @Transactional
    public void applyUpdate(ApprovalRequest approval, Actor checker) {
        RoleDtos.RoleProposal p = proposal(approval);
        Role r = load(approval.tenantId, approval.targetResourceId);
        requirePinned(r, p);
        List<String> current = rbac.permissionKeysForRole(r.id);
        List<String> proposed = requireCatalogKeys(p.permissionKeys());
        for (String k : minus(current, proposed)) rolePermissions.deleteById(new RolePermissionId(r.id, k));
        for (String k : minus(proposed, current)) grant(r.id, k);
        // the grant set is part of the role's state: version bumps atomically against the pinned base
        if (roles.bumpVersion(r.id, p.baseVersion(), p.name()) != 1) {
            throw ApiException.conflict("STALE_WRITE", "The role changed while this request was applied; request again");
        }
        record(approval.makerId, checker.personId(), approval.tenantId, "ROLE_UPDATED", r.id,
            snapshot(r, current), snapshot(r, proposed));
        log.info("role_update_applied tenant={} role={} added={} removed={} approvalId={} checker={}",
            approval.tenantId, r.key, minus(proposed, current), minus(current, proposed), approval.id, checker.personId());
    }

    /** Approved ROLE_DELETE: only while still unassigned (re-checked). */
    @Transactional
    public void applyDelete(ApprovalRequest approval, Actor checker) {
        RoleDtos.RoleProposal p = proposal(approval);
        Role r = load(approval.tenantId, approval.targetResourceId);
        requirePinned(r, p);
        requireMutable(r, true);
        requireUnassigned(r);
        List<String> current = rbac.permissionKeysForRole(r.id);
        roles.delete(r); // role_permissions cascade (V1)
        record(approval.makerId, checker.personId(), approval.tenantId, "ROLE_DELETED", r.id, snapshot(r, current), null);
        log.info("role_delete_applied tenant={} role={} approvalId={} checker={}",
            approval.tenantId, r.key, approval.id, checker.personId());
    }

    /** Rejections change nothing in the domain; the evidence row is the approval itself. */
    public void rejected(ApprovalRequest approval, Actor checker) {
        log.info("role_change_rejected tenant={} type={} target={} approvalId={} checker={}",
            approval.tenantId, approval.operationType, approval.targetResourceId, approval.id, checker.personId());
    }

    // ---------------------------------------------------------------- guards

    private void requireRead(Actor actor, UUID tenantId) {
        permissions.requireAny(actor, List.of(VIEW, MANAGE), tenantId);
        requireTenant(tenantId);
    }

    private void requireManage(Actor actor, UUID tenantId) {
        permissions.require(actor, MANAGE, tenantId);
        requireTenant(tenantId);
    }

    private void requireTenant(UUID tenantId) {
        if (!tenants.existsById(tenantId)) throw ApiException.notFound("TENANT_NOT_FOUND", "Organization not found");
    }

    /** Concealed 404: a role of another organization is indistinguishable from a missing one. */
    private Role load(UUID tenantId, UUID roleId) {
        Role r = roles.findById(roleId).orElse(null);
        if (r == null || !tenantId.equals(r.tenantId)) {
            throw ApiException.notFound("ROLE_NOT_FOUND", "Role not found in this organization");
        }
        return r;
    }

    private static void requireMutable(Role r, boolean deleting) {
        if ("PLATFORM".equals(r.scope) || (deleting && ANCHOR_ROLES.contains(r.key))) {
            log.warn("role_change_protected role={} scope={} deleting={}", r.key, r.scope, deleting);
            throw ApiException.conflict("ROLE_PROTECTED", deleting
                ? "Role %s is protected and cannot be deleted".formatted(r.key)
                : "Platform role %s cannot be changed here".formatted(r.key));
        }
    }

    private static void requireVersion(Role r, Long expected) {
        if (expected == null) throw ApiException.badRequest("VERSION_REQUIRED", "expectedVersion is required for this change");
        if (r.version != expected) {
            throw ApiException.conflict("STALE_WRITE", "This role was changed by someone else; reload and try again");
        }
    }

    private static void requirePinned(Role r, RoleDtos.RoleProposal p) {
        if (p.baseVersion() == null || r.version != p.baseVersion()) {
            log.warn("role_change_stale role={} base={} now={}", r.key, p.baseVersion(), r.version);
            throw ApiException.conflict("STALE_WRITE", "The role changed after this request was made; reject it and request again");
        }
    }

    private void requireNoPending(Role r) {
        if (approvalRows.findByTargetResourceIdAndStatus(r.id, ApprovalRequest.Status.PENDING_CHECKER).stream()
                .anyMatch(a -> ROLE_OPS.contains(a.operationType))) {
            throw ApiException.conflict("ROLE_CHANGE_PENDING", "Role %s already has a change awaiting approval".formatted(r.key));
        }
    }

    private void requireUnassigned(Role r) {
        long n = rbac.countByRoleId(r.id);
        if (n > 0) {
            throw ApiException.conflict("ROLE_IN_USE", "Role %s is assigned to %d people; unassign it first".formatted(r.key, n));
        }
    }

    /** No escalation: the ACTOR PROPOSING must hold every key the change grants or revokes.
     * Applies only at proposal time — a checker approving a four-eyes request never proposes,
     * so requiring the checker to hold the touched keys would deadlock legitimate role
     * upgrades (e.g. adding period.open to a checker role no checker yet holds). */
    private void requireHeld(Actor actor, UUID tenantId, Set<String> touched, String roleKey) {
        if (touched.isEmpty()) return;
        Set<String> held = permissions.effectiveKeys(actor, tenantId);
        List<String> missing = touched.stream().filter(k -> !held.contains(k)).sorted().toList();
        if (!missing.isEmpty()) {
            log.warn("role_change_escalation_denied personId={} tenant={} role={} missing={}",
                actor.personId(), tenantId, roleKey, missing);
            throw ApiException.forbidden("ROLE_NOT_ASSIGNABLE",
                "You can only grant or revoke permissions you hold yourself (missing: %s)".formatted(missing));
        }
    }

    private List<String> requireCatalogKeys(List<String> in) {
        if (in == null) return List.of();
        TreeSet<String> out = new TreeSet<>();
        for (String raw : in) {
            String k = raw == null ? "" : raw.trim();
            if (!catalog.existsById(k)) {
                throw ApiException.badRequest("PERMISSION_UNKNOWN", "Unknown permission key '%s'".formatted(k));
            }
            out.add(k);
        }
        return List.copyOf(out);
    }

    private static String requireName(String raw) {
        String v = raw.trim().replaceAll("\\s+", " ");
        if (v.length() < 2 || v.length() > 80) throw ApiException.badRequest("ROLE_NAME_INVALID", "Role name must be 2–80 characters");
        return v;
    }

    // ---------------------------------------------------------------- helpers

    private void grant(UUID roleId, String key) {
        RolePermission rp = new RolePermission();
        rp.roleId = roleId;
        rp.permissionKey = key;
        rolePermissions.save(rp);
    }

    private Map<UUID, ApprovalRequest> pendingByTarget(UUID tenantId) {
        Map<UUID, ApprovalRequest> out = new HashMap<>();
        for (ApprovalRequest a : approvalRows.findByTenantIdAndStatusOrderByRequestedAtDesc(tenantId,
                ApprovalRequest.Status.PENDING_CHECKER)) {
            if (ROLE_OPS.contains(a.operationType) && a.targetResourceId != null) out.putIfAbsent(a.targetResourceId, a);
        }
        return out;
    }

    private RoleDtos.RoleView view(Role r, ApprovalRequest pending) {
        return new RoleDtos.RoleView(r.id, r.tenantId, r.key, r.name, r.scope, "ACTIVE",
            sorted(rbac.permissionKeysForRole(r.id)), r.version, (int) rbac.countByRoleId(r.id),
            "PLATFORM".equals(r.scope) || ANCHOR_ROLES.contains(r.key),
            pending == null ? null : pending.id, pending == null ? null : pending.operationType);
    }

    private RoleDtos.RoleProposal proposal(ApprovalRequest a) {
        try {
            return mapper.readValue(a.payload, RoleDtos.RoleProposal.class);
        } catch (Exception e) {
            log.error("role_proposal_unreadable approvalId={}", a.id, e);
            throw ApiException.conflict("PAYLOAD_INVALID", "The role change payload is unreadable");
        }
    }

    private String json(RoleDtos.RoleProposal p) {
        try {
            return mapper.writeValueAsString(p);
        } catch (Exception e) {
            throw ApiException.serviceUnavailable("PAYLOAD_SERIALIZE", "Failed to serialize role proposal");
        }
    }

    private static List<String> sorted(List<String> keys) {
        return keys == null ? List.of() : keys.stream().sorted().toList();
    }

    private static Set<String> diff(List<String> a, List<String> b) {
        Set<String> out = new TreeSet<>(minus(a, b));
        out.addAll(minus(b, a));
        return out;
    }

    private static List<String> minus(List<String> a, List<String> b) {
        Set<String> bs = new LinkedHashSet<>(b);
        return a.stream().filter(k -> !bs.contains(k)).sorted().toList();
    }

    private static String snapshot(Role r, List<String> keys) {
        return r.key + "|" + r.name + "|" + sorted(keys);
    }

    /** Audit (state hashes only) + outbox, same transaction (AGENTS §3.6/§3.7). */
    private void record(UUID makerId, UUID checkerId, UUID tenantId, String action, UUID roleId, Object before, Object after) {
        audit.record(makerId, checkerId, tenantId, null, action, "ROLE", roleId.toString(),
            before == null ? null : audit.hashState(before), after == null ? null : audit.hashState(after), false);
        outbox.record("role", roleId, action.toLowerCase(Locale.ROOT).replace('_', '.'),
            "{\"roleId\":\"%s\",\"tenantId\":\"%s\"}".formatted(roleId, tenantId));
    }
}
