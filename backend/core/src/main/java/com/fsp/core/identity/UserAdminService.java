package com.fsp.core.identity;

import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.approval.ApprovalService;
import com.fsp.core.audit.AuditService;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.config.FspProperties;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.rbac.PermissionService;
import com.fsp.core.rbac.RbacRepository;
import com.fsp.core.rbac.Role;
import com.fsp.core.rbac.RoleRepository;
import com.fsp.core.rbac.RoleTemplates;
import com.fsp.core.rbac.UserRole;
import com.fsp.core.tenant.TenantRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Organization user administration: list / view / create / modify / deactivate / activate / remove.
 *
 * <p>State machine (persons.status): {@code ACTIVE ⇄ DISABLED}, either → {@code ARCHIVED} (terminal),
 * plus {@code PENDING} for four-eyes staged changes awaiting checker approval.
 * "Remove" is a soft delete: the person row is retained (records ≥ 5 years, audit + four-eyes
 * history reference person_id) but can never sign in or hold permissions again.
 *
 * <p>All write operations are four-eyes: the maker opens an {@code ApprovalRequest} (PENDING_CHECKER)
 * and a checker must resolve it via {@link ApprovalService} before any change is applied.
 * Guides: user.manage on the target org, person must belong to that org (else concealed 404),
 * optimistic version on every write, no self-lockout, no privilege escalation — an actor can only
 * grant or revoke roles whose permissions they hold themselves.
 */
@Slf4j
@Service
public class UserAdminService {

    static final String PERMISSION = "user.manage";
    static final String STATUS_PENDING = "PENDING";
    /** Max page size for bounded queries (guide §4A: size 1–100, default 25). */
    static final int MAX_PAGE_SIZE = 100;
    static final int DEFAULT_PAGE_SIZE = 25;
    private static final Pattern USERNAME = Pattern.compile("^[a-z0-9][a-z0-9._-]{2,63}$");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
    private static final Pattern PHONE = Pattern.compile("^\\+?[0-9][0-9 ()-]{5,19}$");

    private final PersonRepository persons;
    private final PersonProvisioning provisioning;
    private final RoleRepository roles;
    private final RbacRepository rbac;
    private final TenantRepository tenants;
    private final PermissionService permissions;
    private final AuditService audit;
    private final OutboxService outbox;
    private final ApprovalService approvals;
    private final ObjectMapper mapper;
    private final FspProperties props;

    public UserAdminService(PersonRepository persons, PersonProvisioning provisioning, RoleRepository roles,
                            RbacRepository rbac, TenantRepository tenants, PermissionService permissions,
                            AuditService audit, OutboxService outbox, ApprovalService approvals,
                            ObjectMapper mapper, FspProperties props) {
        this.persons = persons;
        this.provisioning = provisioning;
        this.roles = roles;
        this.rbac = rbac;
        this.tenants = tenants;
        this.permissions = permissions;
        this.audit = audit;
        this.outbox = outbox;
        this.approvals = approvals;
        this.mapper = mapper;
        this.props = props;
    }

    // ------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public List<UserDtos.UserView> list(UUID tenantId, Actor actor, Integer page, Integer size) {
        requireOrg(actor, tenantId);
        int pageNum = page == null || page < 0 ? 0 : page;
        int s = size == null || size < 1 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        List<Person> rows = persons.findByTenantIdOrderByUsernameAsc(tenantId, PageRequest.of(pageNum, s, Sort.by("username")));
        Map<UUID, List<UserDtos.RoleRef>> roleMap = rolesFor(rows.stream().map(pr -> pr.id).toList(), tenantId);
        return rows.stream().map(pr -> view(pr, roleMap.getOrDefault(pr.id, List.of()))).toList();
    }

    @Transactional(readOnly = true)
    public UserDtos.UserView get(UUID tenantId, UUID personId, Actor actor) {
        requireOrg(actor, tenantId);
        return viewOf(load(tenantId, personId));
    }

    @Transactional(readOnly = true)
    public List<UserDtos.RoleOption> roleOptions(UUID tenantId, Actor actor) {
        requireOrg(actor, tenantId);
        Set<String> held = permissions.effectiveKeys(actor, tenantId);
        return roles.findByTenantId(tenantId).stream()
            .sorted(Comparator.comparing(r -> r.name))
            .map(r -> {
                List<String> keys = rbac.permissionKeysForRole(r.id);
                return new UserDtos.RoleOption(r.id, r.key, r.name, r.scope, keys.size(), held.containsAll(keys));
            })
            .toList();
    }

    // ----------------------------------------------------------------- writes

    @Transactional
    public UserDtos.UserView create(UUID tenantId, UserDtos.CreateUser in, Actor actor) {
        requireOrg(actor, tenantId);
        if (in == null) throw ApiException.badRequest("BODY_INVALID", "Request body required");
        String username = in.username() == null ? "" : in.username().trim().toLowerCase(Locale.ROOT);
        if (!USERNAME.matcher(username).matches()) {
            throw ApiException.badRequest("USERNAME_INVALID",
                "Username must be 3–64 characters: lowercase letters, digits, '.', '_' or '-', starting with a letter or digit");
        }
        if (persons.findByUsernameIgnoreCase(username).isPresent()) {
            throw ApiException.conflict("USERNAME_TAKEN", "Username '%s' is already in use".formatted(username));
        }
        String fullName = requireFullName(in.fullName());
        String email = normalizeEmail(in.email());
        String phone = normalizePhone(in.phone());
        List<Role> grant = resolveRoles(tenantId, in.roleIds());
        requireAssignable(actor, tenantId, grant, null);

        // Stage the person in PENDING state — no sign-in, no roles until checker approves.
        Person p = provisioning.createPerson(tenantId, username, fullName, email,
            props.getSecurity().getDefaultPersonPassword(), false);
        p.status = STATUS_PENDING;
        p.phone = phone;
        p.updatedAt = Instant.now();
        Person saved = persons.save(p);

        String payload;
        try {
            payload = mapper.writeValueAsString(Map.of(
                "roleIds", grant.stream().map(r -> r.id.toString()).toList(),
                "checker", Boolean.TRUE.equals(in.checker())));
        } catch (Exception e) {
            throw ApiException.serviceUnavailable("PAYLOAD_SERIALIZE", "Failed to serialize create payload");
        }
        approvals.open(tenantId, ApprovalRequest.OpType.USER_CREATE, saved.id, actor,
            "create:" + username, payload);

        UserDtos.UserView after = view(saved, List.of());
        record(actor, tenantId, "USER_CREATE_REQUESTED", saved.id, null, after);
        log.info("user_create_requested personId={} tenant={} roles={} by={} (awaiting checker approval)",
            saved.id, tenantId, grant.size(), actor.personId());
        return after;
    }

    @Transactional
    public UserDtos.UserView update(UUID tenantId, UUID personId, UserDtos.UpdateUser in, Actor actor) {
        requireOrg(actor, tenantId);
        if (in == null) throw ApiException.badRequest("BODY_INVALID", "Request body required");
        Person p = load(tenantId, personId);
        requireVersion(p, in.expectedVersion());
        if ("ARCHIVED".equals(p.status)) {
            throw ApiException.conflict("USER_STATE", "A removed user cannot be modified");
        }
        if ("PENDING".equals(p.status)) {
            throw ApiException.conflict("USER_STATE", "User has a pending change awaiting approval; resolve it first");
        }
        UserDtos.UserView before = viewOf(p);

        // Validate proposed values without mutating yet.
        String proposedFullName = in.fullName() == null ? p.fullName : requireFullName(in.fullName());
        String proposedEmail = in.email() == null ? p.email : normalizeEmail(in.email());
        String proposedPhone = in.phone() == null ? p.phone : normalizePhone(in.phone());
        List<Role> proposedRoles = in.roleIds() == null ? currentRoles(p) : resolveRoles(tenantId, in.roleIds());
        requireAssignable(actor, tenantId, proposedRoles, p.id);
        boolean proposedChecker = in.checker() == null ? p.isChecker : in.checker();

        String payload;
        try {
            payload = mapper.writeValueAsString(Map.of(
                "fullName", proposedFullName,
                "email", proposedEmail,
                "phone", proposedPhone,
                "roleIds", proposedRoles.stream().map(r -> r.id.toString()).toList(),
                "checker", proposedChecker
            ));
        } catch (Exception e) {
            throw ApiException.serviceUnavailable("PAYLOAD_SERIALIZE", "Failed to serialize update payload");
        }
        approvals.open(tenantId, ApprovalRequest.OpType.USER_UPDATE, p.id, actor,
            "update:" + p.username, payload);

        record(actor, tenantId, "USER_UPDATE_REQUESTED", p.id, before, before);
        log.info("user_update_requested personId={} tenant={} by={} (awaiting checker approval)",
            p.id, tenantId, actor.personId());
        return before;
    }

    @Transactional
    public UserDtos.UserView deactivate(UUID tenantId, UUID personId, Long expectedVersion, Actor actor) {
        return transition(tenantId, personId, expectedVersion, actor, "ACTIVE", "DISABLED",
            ApprovalRequest.OpType.USER_DEACTIVATE, "USER_DEACTIVATE_REQUESTED");
    }

    @Transactional
    public UserDtos.UserView activate(UUID tenantId, UUID personId, Long expectedVersion, Actor actor) {
        return transition(tenantId, personId, expectedVersion, actor, "DISABLED", "ACTIVE",
            ApprovalRequest.OpType.USER_ACTIVATE, "USER_ACTIVATE_REQUESTED");
    }

    @Transactional
    public UserDtos.UserView remove(UUID tenantId, UUID personId, Long expectedVersion, Actor actor) {
        requireOrg(actor, tenantId);
        Person p = load(tenantId, personId);
        requireVersion(p, expectedVersion);
        requireNotSelf(actor, p, "remove");
        if ("ARCHIVED".equals(p.status)) {
            throw ApiException.conflict("USER_STATE", "User is already removed");
        }
        if ("PENDING".equals(p.status)) {
            throw ApiException.conflict("USER_STATE", "User has a pending change awaiting approval; resolve it first");
        }
        UserDtos.UserView before = viewOf(p);
        approvals.open(tenantId, ApprovalRequest.OpType.USER_REMOVE, p.id, actor,
            "remove:" + p.username, null);
        record(actor, tenantId, "USER_REMOVE_REQUESTED", p.id, before, before);
        log.info("user_remove_requested personId={} tenant={} by={} (awaiting checker approval)",
            p.id, tenantId, actor.personId());
        return before;
    }

    // ---------------------------------------------------------------- helpers

    private UserDtos.UserView transition(UUID tenantId, UUID personId, Long expectedVersion, Actor actor,
                                         String from, String to, String opType, String action) {
        requireOrg(actor, tenantId);
        Person p = load(tenantId, personId);
        requireVersion(p, expectedVersion);
        requireNotSelf(actor, p, to.equals("DISABLED") ? "deactivate" : "activate");
        if (!from.equals(p.status)) {
            log.warn("user_transition_rejected personId={} status={} wanted={}", p.id, p.status, to);
            throw ApiException.conflict("USER_STATE",
                "User is %s; only %s users can be %s".formatted(p.status, from,
                    "ACTIVE".equals(to) ? "activated" : "deactivated"));
        }
        if ("PENDING".equals(p.status)) {
            throw ApiException.conflict("USER_STATE", "User has a pending change awaiting approval; resolve it first");
        }
        UserDtos.UserView before = viewOf(p);
        approvals.open(tenantId, opType, p.id, actor, action + ":" + p.username, null);
        record(actor, tenantId, action, p.id, before, before);
        log.info("user_transition_requested personId={} tenant={} from={} to={} by={} (awaiting checker approval)",
            p.id, tenantId, from, to, actor.personId());
        return before;
    }

    // ------------------------------------------------------------ apply (checker side)

    /** Apply an approved USER_CREATE: activate the person and grant roles. */
    @Transactional
    public void applyCreate(UUID personId, String payloadJson, UUID checkerId, String reason) {
        Person p = persons.findById(personId)
            .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User not found"));
        if (!STATUS_PENDING.equals(p.status)) {
            throw ApiException.conflict("USER_STATE", "User is not in PENDING state (current: %s)".formatted(p.status));
        }
        List<UUID> roleIds = parseRoleIdsFromPayload(payloadJson);
        p.isChecker = parseCheckerFromPayload(payloadJson, false);
        p.status = "ACTIVE";
        p.updatedAt = Instant.now();
        Person saved = persons.saveAndFlush(p);
        for (UUID roleId : roleIds) provisioning.assignRole(saved.id, roleId);
        log.info("user_create_applied personId={} tenant={} roles={} checker={}", saved.id, saved.tenantId, roleIds.size(), checkerId);
    }

    /** Apply an approved USER_UPDATE: fields + roles. */
    @Transactional
    public void applyUpdate(UUID personId, String payloadJson, UUID checkerId, String reason) {
        Person p = persons.findById(personId)
            .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User not found"));
        if ("ARCHIVED".equals(p.status)) {
            throw ApiException.conflict("USER_STATE", "A removed user cannot be modified");
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> patch;
        try {
            patch = mapper.readValue(payloadJson, Map.class);
        } catch (Exception e) {
            throw ApiException.badRequest("PAYLOAD_INVALID", "Update payload is not valid JSON");
        }
        if (patch.containsKey("fullName")) p.fullName = requireFullName(String.valueOf(patch.get("fullName")));
        if (patch.containsKey("email")) p.email = normalizeEmail(String.valueOf(patch.get("email")));
        if (patch.containsKey("phone")) p.phone = normalizePhone(String.valueOf(patch.get("phone")));
        if (patch.containsKey("checker")) p.isChecker = Boolean.TRUE.equals(patch.get("checker"));
        if (patch.containsKey("roleIds")) {
            @SuppressWarnings("unchecked")
            List<String> ids = (List<String>) patch.get("roleIds");
            List<Role> wanted = resolveRoles(p.tenantId, ids.stream().map(UUID::fromString).toList());
            Actor checkerActor = new Actor(checkerId, null, p.tenantId);
            requireAssignable(checkerActor, p.tenantId, wanted, p.id);
            Set<UUID> wantedIds = new LinkedHashSet<>(wanted.stream().map(r -> r.id).toList());
            Set<UUID> current = new LinkedHashSet<>(currentRoleIds(p.id, p.tenantId));
            for (UUID id : current) if (!wantedIds.contains(id)) rbac.deleteByPersonIdAndRoleId(p.id, id);
            for (Role r : wanted) if (!current.contains(r.id)) provisioning.assignRole(p.id, r.id);
        }
        p.updatedAt = Instant.now();
        persons.saveAndFlush(p);
        log.info("user_update_applied personId={} tenant={} checker={}", p.id, p.tenantId, checkerId);
    }

    /** Apply an approved USER_DEACTIVATE. */
    @Transactional
    public void applyDeactivate(UUID personId, UUID checkerId, String reason) {
        applyStatusTransition(personId, "ACTIVE", "DISABLED", checkerId, reason);
    }

    /** Apply an approved USER_ACTIVATE. */
    @Transactional
    public void applyActivate(UUID personId, UUID checkerId, String reason) {
        applyStatusTransition(personId, "DISABLED", "ACTIVE", checkerId, reason);
    }

    /** Apply an approved USER_REMOVE. */
    @Transactional
    public void applyRemove(UUID personId, UUID checkerId, String reason) {
        applyStatusTransition(personId, null, "ARCHIVED", checkerId, reason);
    }

    private void applyStatusTransition(UUID personId, String expected, String target, UUID checkerId, String reason) {
        Person p = persons.findById(personId)
            .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User not found"));
        if ("ARCHIVED".equals(p.status)) {
            throw ApiException.conflict("USER_STATE", "A removed user cannot be modified");
        }
        if (expected != null && !expected.equals(p.status)) {
            throw ApiException.conflict("USER_STATE",
                "User is %s; only %s users can be %s".formatted(p.status, expected, target));
        }
        p.status = target;
        p.updatedAt = Instant.now();
        if ("ARCHIVED".equals(target)) p.archivedAt = Instant.now();
        persons.saveAndFlush(p);
        log.info("user_transition_applied personId={} tenant={} to={} checker={}", p.id, p.tenantId, target, checkerId);
    }

    /** Current role IDs for a person within its org. */
    private List<Role> currentRoles(Person p) {
        Set<UUID> orgRoleIds = new LinkedHashSet<>(roles.findByTenantId(p.tenantId).stream().map(r -> r.id).toList());
        return rbac.findByPersonId(p.id).stream().map(ur -> ur.roleId).filter(orgRoleIds::contains)
            .map(roles::findById).filter(java.util.Optional::isPresent).map(java.util.Optional::get).toList();
    }

    /** Parse the checker flag from a create/update payload JSON (absent → fallback). */
    private boolean parseCheckerFromPayload(String payloadJson, boolean fallback) {
        if (payloadJson == null || payloadJson.isBlank()) return fallback;
        try {
            Object v = mapper.readValue(payloadJson, Map.class).get("checker");
            return v == null ? fallback : Boolean.TRUE.equals(v);
        } catch (Exception e) {
            return fallback;
        }
    }

    /** Parse roleIds from a create/update payload JSON. */
    private List<UUID> parseRoleIdsFromPayload(String payloadJson) {
        if (payloadJson == null || payloadJson.isBlank()) return List.of();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> patch = mapper.readValue(payloadJson, Map.class);
            @SuppressWarnings("unchecked")
            List<String> ids = (List<String>) patch.getOrDefault("roleIds", List.of());
            return ids.stream().map(UUID::fromString).toList();
        } catch (Exception e) {
            throw ApiException.badRequest("PAYLOAD_INVALID", "Payload is not valid JSON");
        }
    }

    private void requireOrg(Actor actor, UUID tenantId) {
        permissions.require(actor, PERMISSION, tenantId);
        if (!tenants.existsById(tenantId)) {
            throw ApiException.notFound("TENANT_NOT_FOUND", "Organization not found");
        }
    }

    /** Concealed 404: a person of another org is indistinguishable from a missing one. */
    private Person load(UUID tenantId, UUID personId) {
        Person p = persons.findById(personId).orElse(null);
        if (p == null || !tenantId.equals(p.tenantId)) {
            throw ApiException.notFound("USER_NOT_FOUND", "User not found in this organization");
        }
        return p;
    }

    private static void requireVersion(Person p, Long expected) {
        if (expected == null) {
            throw ApiException.badRequest("VERSION_REQUIRED", "expectedVersion is required for this change");
        }
        if (p.version != expected) {
            throw ApiException.conflict("STALE_WRITE",
                "This user was changed by someone else; reload and try again");
        }
    }

    private static void requireNotSelf(Actor actor, Person p, String verb) {
        if (p.id.equals(actor.personId())) {
            throw ApiException.conflict("SELF_LOCKOUT", "You cannot %s your own account".formatted(verb));
        }
    }

    private static String requireFullName(String raw) {
        String v = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (v.length() < 2 || v.length() > 120) {
            throw ApiException.badRequest("FULL_NAME_INVALID", "Full name must be 2–120 characters");
        }
        return v;
    }

    /** Blank clears the field. */
    private static String normalizeEmail(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim().toLowerCase(Locale.ROOT);
        if (v.length() > 254 || !EMAIL.matcher(v).matches()) {
            throw ApiException.badRequest("EMAIL_INVALID", "Enter a valid email address");
        }
        return v;
    }

    private static String normalizePhone(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim();
        if (!PHONE.matcher(v).matches()) {
            throw ApiException.badRequest("PHONE_INVALID", "Enter a valid phone number, e.g. +264 81 123 4567");
        }
        return v;
    }

    private List<Role> resolveRoles(UUID tenantId, List<UUID> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) return List.of();
        Map<UUID, Role> orgRoles = new HashMap<>();
        for (Role r : roles.findByTenantId(tenantId)) orgRoles.put(r.id, r);
        List<Role> out = new ArrayList<>();
        for (UUID id : new LinkedHashSet<>(roleIds)) {
            Role r = orgRoles.get(id);
            if (r == null) throw ApiException.badRequest("ROLE_UNKNOWN", "Role is not defined by this organization");
            out.add(r);
        }
        return out;
    }

    /** No escalation: granting or revoking a role requires holding every permission it carries —
     *  EXCEPT the organization's own born roles, which a {@code user.manage} maker may stage
     *  for a person OTHER than themselves (the merchant-admin stages its checker per the
     *  onboarding script; only self-assignment is blocked, so nobody escalates themselves). */
    private void requireAssignable(Actor actor, UUID tenantId, List<Role> touched, UUID subjectPersonId) {
        if (touched.isEmpty()) return;
        Set<String> held = permissions.effectiveKeys(actor, tenantId);
        for (Role r : touched) {
            List<String> keys = rbac.permissionKeysForRole(r.id);
            if (held.containsAll(keys)) continue;
            if (RoleTemplates.ADMIN_ROLE.equals(r.key) || RoleTemplates.CHECKER_ROLE.equals(r.key)) {
                if (subjectPersonId == null || !actor.personId().equals(subjectPersonId)) {
                    log.info("role_assignment_born_role personId={} tenant={} role={} staged=true", actor.personId(), tenantId, r.key);
                    continue;
                }
            }
            log.warn("role_assignment_denied personId={} tenant={} role={}", actor.personId(), tenantId, r.key);
            throw ApiException.forbidden("ROLE_NOT_ASSIGNABLE",
                "You can only grant or revoke roles whose permissions you hold yourself (%s)".formatted(r.name));
        }
    }

    private List<UUID> currentRoleIds(UUID personId, UUID tenantId) {
        Set<UUID> orgRoleIds = new LinkedHashSet<>(roles.findByTenantId(tenantId).stream().map(r -> r.id).toList());
        return rbac.findByPersonId(personId).stream().map(ur -> ur.roleId).filter(orgRoleIds::contains).toList();
    }

    private Map<UUID, List<UserDtos.RoleRef>> rolesFor(List<UUID> personIds, UUID tenantId) {
        if (personIds.isEmpty()) return Map.of();
        Map<UUID, Role> orgRoles = new HashMap<>();
        for (Role r : roles.findByTenantId(tenantId)) orgRoles.put(r.id, r);
        Map<UUID, List<UserDtos.RoleRef>> out = new HashMap<>();
        for (UserRole ur : rbac.findByPersonIdIn(personIds)) {
            Role r = orgRoles.get(ur.roleId);
            if (r == null) continue;
            out.computeIfAbsent(ur.personId, k -> new ArrayList<>()).add(new UserDtos.RoleRef(r.id, r.key, r.name));
        }
        out.values().forEach(l -> l.sort(Comparator.comparing(UserDtos.RoleRef::name)));
        return out;
    }

    private UserDtos.UserView viewOf(Person p) {
        return view(p, rolesFor(List.of(p.id), p.tenantId).getOrDefault(p.id, List.of()));
    }

    private static UserDtos.UserView view(Person p, List<UserDtos.RoleRef> roleRefs) {
        return new UserDtos.UserView(p.id, p.tenantId, p.username, p.fullName, p.email, p.phone, p.status,
            p.isApplicant, p.isChecker, roleRefs, p.version, p.createdAt, p.updatedAt, p.archivedAt);
    }

    /** Audit (hashes only — never PII) + outbox event in the same transaction (AGENTS §3.6/§3.7). */
    private void record(Actor actor, UUID tenantId, String action, UUID personId,
                        UserDtos.UserView before, UserDtos.UserView after) {
        audit.record(actor.personId(), null, tenantId, null, action, "PERSON", personId.toString(),
            before == null ? null : audit.hashState(before), audit.hashState(after), false);
        outbox.record("person", personId, action.toLowerCase(Locale.ROOT).replace('_', '.'),
            "{\"personId\":\"%s\",\"tenantId\":\"%s\",\"status\":\"%s\"}".formatted(personId, tenantId, after.status()));
    }
}
