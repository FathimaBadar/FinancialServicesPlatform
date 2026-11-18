package com.fsp.core.plugin.authz;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import com.fsp.core.tenant.Tenant;
import com.fsp.core.tenant.TenantRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Tenant children creation endpoint (§12.5 step 4 of plugin-platform-plan).
 * POST /v1/tenants/{parentId}/children — creates tenant PENDING + applicant admin +
 * suspended books atomically. Called by plugins on behalf of a person (DELEGATED actor).
 * This is the core part of the onboarding saga; the plugin continues with KYC case,
 * screening, approval, and verification.
 */
@Slf4j
@RestController
public class TenantChildrenController {

    private final TenantChildrenService service;
    private final com.fsp.core.rbac.PermissionService permissions;

    public TenantChildrenController(TenantChildrenService service, com.fsp.core.rbac.PermissionService permissions) {
        this.service = service;
        this.permissions = permissions;
    }

    @FspOperation(id = "tenant.child.create", component = "tenant", permission = "org.create",
        risk = FspOperation.OperationRisk.WRITE,
        title = "Create child tenant (onboarding saga step 4, delegated)",
        actors = {Actor.ActorType.DELEGATED, Actor.ActorType.PERSON})
    @PostMapping("/v1/tenants/{parentId}/children")
    public Tenant createChild(@PathVariable("parentId") UUID parentId,
                              @RequestBody Map<String, Object> body,
                              HttpServletRequest request) {
        Actor actor = actor(request);
        // The interceptor resolves {tenantId} only — decide on the PARENT explicitly (reachability +
        // permission at the node the child is created under), for the person AND the plugin client.
        permissions.require(actor, "org.create", parentId);
        if (actor.type() == Actor.ActorType.DELEGATED) {
            permissions.requireClient(actor.clientId(), "org.create", parentId);
        }

        String legalName = asString(body.get("legalName"));
        String subType = asString(body.get("subType"));
        String adminUsername = asString(body.get("adminUsername"));
        String adminFullName = asString(body.get("adminFullName"));

        if (legalName == null || legalName.isBlank()) {
            throw ApiException.badRequest("TENANT_FIELDS", "legalName is required");
        }
        if (adminUsername == null || adminUsername.isBlank()) {
            throw ApiException.badRequest("TENANT_FIELDS", "adminUsername is required");
        }

        return service.createChild(parentId, legalName, subType, adminUsername, adminFullName, actor);
    }

    private static Actor actor(HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null) throw ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        return actor;
    }

    private static String asString(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
