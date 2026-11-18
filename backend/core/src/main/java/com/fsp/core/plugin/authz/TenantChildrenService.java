package com.fsp.core.plugin.authz;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.identity.PersonProvisioning;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.rbac.Role;
import com.fsp.core.tenant.Tenant;
import com.fsp.core.tenant.TenantRepository;
import com.fsp.core.audit.AuditService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Tenant children creation for the plugin onboarding saga (§12.5 step 4).
 * Core part is atomic: tenant PENDING + applicant admin + suspended books.
 * Any failure rolls back everything (PRD §3.9).
 * Called by plugins on behalf of a person (DELEGATED actor).
 */
@Slf4j
@Service
public class TenantChildrenService {

    // Maker-side permissions for the new tenant
    private static final List<String> TENANT_ADMIN_PERMS = List.of(
        "kyc.review", "kyc.approve", "je.create", "je.view", "gl.account.create",
        "gl.account.view", "bank.account.create", "period.open", "audit.view");
    private static final List<String> TENANT_CHECKER_PERMS = List.of(
        "kyc.approve", "kyc.reject", "kyc.review", "org.activate", "je.approve", "je.view",
        "gl.account.approve", "gl.account.view", "bank.account.approve", "audit.view");

    private final TenantRepository tenantRepository;
    private final PersonProvisioning provisioning;
    private final AuditService audit;
    private final OutboxService outbox;
    private final com.fsp.core.config.FspProperties props;

    public TenantChildrenService(TenantRepository tenantRepository, PersonProvisioning provisioning,
                                 AuditService audit, OutboxService outbox,
                                 com.fsp.core.config.FspProperties props) {
        this.tenantRepository = tenantRepository;
        this.provisioning = provisioning;
        this.audit = audit;
        this.outbox = outbox;
        this.props = props;
    }

    @Transactional
    public Tenant createChild(UUID parentTenantId, String legalName, String subType,
                              String adminUsername, String adminFullName, Actor actor) {
        // Actor must be DELEGATED (person acting through plugin) or PERSON
        if (actor.type() != Actor.ActorType.DELEGATED && actor.type() != Actor.ActorType.PERSON) {
            throw ApiException.forbidden("ACTOR_TYPE_REJECTED",
                "Only person or delegated actors can create child tenants");
        }
        if (actor.personId() == null) {
            throw ApiException.forbidden("ACTOR_TYPE_REJECTED",
                "Maker must be a person (four-eyes at person_id)");
        }

        Tenant parent = tenantRepository.findById(parentTenantId)
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Parent tenant not found"));
        if (!"ACTIVE".equals(parent.status)) {
            throw ApiException.conflict("PARENT_NOT_ACTIVE", "Parent tenant is not ACTIVE");
        }
        if (legalName == null || legalName.isBlank()) {
            throw ApiException.badRequest("TENANT_FIELDS", "legalName is required");
        }

        String st = (subType == null ? "MERCHANT" : subType).toUpperCase();

        Tenant child = new Tenant();
        child.id = UUID.randomUUID();
        child.parentTenantId = parent.id;
        child.depth = parent.depth + 1;
        child.hierarchyPath = parent.hierarchyPath + "/" + child.id;
        child.type = "TENANT";
        child.subType = st;
        child.status = "PENDING";
        child.verificationStatus = "PENDING";
        child.legalName = legalName.trim();
        child.createdBy = actor.personId();
        tenantRepository.save(child);

        // Provision applicant admin + checker roles
        Role adminRole = provisioning.ensureRole(child.id, "TENANT_ADMIN", "Tenant Admin", "TENANT", TENANT_ADMIN_PERMS);
        Role checkerRole = provisioning.ensureRole(child.id, "TENANT_CHECKER", "Tenant Checker", "TENANT", TENANT_CHECKER_PERMS);

        // credentials belong to the IdP; the bootstrap password comes from config (FSP_PERSON_PASSWORD)
        String defaultPassword = props.getSecurity().getDefaultPersonPassword();
        var adminPerson = provisioning.createPerson(
            child.id, adminUsername, adminFullName != null ? adminFullName : adminUsername, null, defaultPassword, true);
        var checkerPerson = provisioning.createPerson(
            child.id, "checker-" + adminUsername, "Checker for " + adminUsername, null, defaultPassword, true);
        provisioning.assignRole(adminPerson.id, adminRole.id);
        provisioning.assignRole(checkerPerson.id, checkerRole.id);

        // Suspended books will be activated by verification (§7.3) after KYC verdict
        // Note: book creation is handled by KycOnboardingService in the full flow;
        // here we create the tenant skeleton for the saga.

        audit.record(actor.personId(), null, child.id, null,
            "TENANT_CHILD_CREATED", "TENANT", child.id.toString(),
            null, audit.hashState("status=PENDING;parent=" + parentTenantId), false);
        outbox.record("Tenant", child.id, "Tenant.ChildCreated",
            "{\"tenantId\":\"%s\",\"parentId\":\"%s\",\"legalName\":\"%s\",\"subType\":\"%s\",\"maker\":\"%s\"}"
                .formatted(child.id, parentTenantId, legalName, st, actor.personId()));

        log.info("tenant_child_created tenantId={} parentId={} maker={} subType={}",
            child.id, parentTenantId, actor.personId(), st);
        return child;
    }
}
