package com.fsp.core.tenant;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.config.FspProperties;
import com.fsp.core.identity.Person;
import com.fsp.core.identity.PersonProvisioning;
import com.fsp.core.identity.PersonRepository;
import com.fsp.core.rbac.PermissionService;
import com.fsp.core.rbac.Role;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Tenant hierarchy management. Platform root creates PSP tenants (with maker+checker personnel
 * and scoped roles); PSP admins onboard supply-chain tenants through the KYC plugin flow.
 */
@Slf4j
@Service
public class TenantService {

    /** Maker-side permissions held by the PSP TENANT_ADMIN role. */
    private static final List<String> PSP_ADMIN_PERMS = List.of(
        "je.create", "je.view", "gl.account.create",
        "gl.account.view", "bank.account.create", "period.open", "period.close", "audit.view");

    /** Checker-side permissions held by the PSP TENANT_CHECKER role. */
    private static final List<String> PSP_CHECKER_PERMS = List.of(
        "je.approve", "je.view",
        "gl.account.approve", "gl.account.view", "bank.account.approve", "audit.view");

    private final TenantRepository tenantRepository;
    private final PersonRepository personRepository;
    private final PersonProvisioning provisioning;
    private final PermissionService permissions;
    private final FspProperties props;

    public TenantService(TenantRepository tenantRepository, PersonRepository personRepository,
                         PersonProvisioning provisioning, PermissionService permissions,
                         FspProperties props) {
        this.tenantRepository = tenantRepository;
        this.personRepository = personRepository;
        this.provisioning = provisioning;
        this.permissions = permissions;
        this.props = props;
    }

    /** POST /v1/tenants — platform admin only (org.create + caller must sit on the PLATFORM root). */
    @Transactional
    public TenantDtos.PspCreated createPsp(Actor actor, TenantDtos.CreatePspRequest req) {
        permissions.require(actor, "org.create", actor.activeTenantId());
        Tenant parent = tenantRepository.findById(actor.activeTenantId())
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Caller tenant missing"));
        if (!"PLATFORM".equals(parent.type)) {
            log.warn("psp_create_denied actor={} type={}", actor.personId(), parent.type);
            throw ApiException.forbidden("TENANT_TYPE", "Only the platform root can create PSP tenants");
        }
        if (req.legalName() == null || req.legalName().isBlank()
            || req.adminUsername() == null || req.adminUsername().isBlank()
            || req.checkerUsername() == null || req.checkerUsername().isBlank()) {
            throw ApiException.badRequest("TENANT_FIELDS", "legalName, adminUsername, checkerUsername required");
        }

        Tenant psp = new Tenant();
        psp.id = UUID.randomUUID();
        psp.parentTenantId = parent.id;
        psp.depth = parent.depth + 1;
        psp.hierarchyPath = parent.hierarchyPath + "/" + psp.id;
        psp.type = "PSP";
        psp.status = "ACTIVE";
        psp.verificationStatus = "VERIFIED";
        psp.legalName = req.legalName().trim();
        psp.createdBy = actor.personId();
        psp.activatedBy = actor.personId();
        tenantRepository.save(psp);

        Role adminRole = provisioning.ensureRole(psp.id, "TENANT_ADMIN", "Tenant Admin", "TENANT", PSP_ADMIN_PERMS);
        Role checkerRole = provisioning.ensureRole(psp.id, "TENANT_CHECKER", "Tenant Checker", "TENANT", PSP_CHECKER_PERMS);

        String defaultPassword = props.getSecurity().getDefaultPersonPassword();
        Person admin = provisioning.createPerson(psp.id, req.adminUsername(),
            req.adminFullName() == null || req.adminFullName().isBlank()
                ? req.adminUsername() : req.adminFullName(), null, defaultPassword, false);
        Person checker = provisioning.createPerson(psp.id, req.checkerUsername(),
            req.checkerFullName() == null || req.checkerFullName().isBlank()
                ? req.checkerUsername() : req.checkerFullName(), null, defaultPassword, false);
        provisioning.assignRole(admin.id, adminRole.id);
        provisioning.assignRole(checker.id, checkerRole.id);

        log.info("psp_created tenantId={} admin={} checker={} depth={}", psp.id, admin.username, checker.username, psp.depth);
        return new TenantDtos.PspCreated(psp.id, admin.username, checker.username,
            "Temporary password: use the value of FSP_PERSON_PASSWORD (default fsp-person-2026); reset on first login in hardening slices");
    }

    /** Scoped reads: any effective permission on the target chain, otherwise hidden. */
    public TenantDtos.TenantView detail(UUID tenantId, Actor actor) {
        requireReachable(actor, tenantId);
        Tenant t = tenantRepository.findById(tenantId)
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Tenant not found"));
        return view(t);
    }

    public List<TenantDtos.TenantView> children(UUID tenantId, Actor actor) {
        requireReachable(actor, tenantId);
        return tenantRepository.findByParentTenantId(tenantId).stream().map(TenantService::view).toList();
    }

    private void requireReachable(Actor actor, UUID tenantId) {
        permissions.requireAny(actor, List.of(
            "je.view", "gl.account.view", "audit.view",
            "org.create", "org.activate"), tenantId);
    }

    private static TenantDtos.TenantView view(Tenant t) {
        return new TenantDtos.TenantView(t.id, t.parentTenantId, t.hierarchyPath, t.depth, t.type,
            t.subType, t.status, t.verificationStatus, t.legalName, t.createdAt);
    }
}
