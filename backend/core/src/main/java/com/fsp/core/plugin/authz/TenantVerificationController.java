package com.fsp.core.plugin.authz;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Tenant verification verdict endpoint (§7.3 of plugin-platform-plan).
 * POST /v1/tenants/{tenantId}/verification — machine-only (actors={MACHINE}).
 * Plugin reports a KYC verdict (VERIFIED/REJECTED) after a checker approves through
 * the four-eyes approval flow. Core validates the approval, payloadHash, and four-eyes,
 * then records the verification status and activates the tenant if PENDING.
 */
@Slf4j
@RestController
public class TenantVerificationController {

    private final TenantVerificationService service;

    public TenantVerificationController(TenantVerificationService service) {
        this.service = service;
    }

    @FspOperation(id = "tenant.verification.record", component = "tenant", permission = "plugin.manage",
        risk = FspOperation.OperationRisk.WRITE,
        title = "Record tenant verification verdict (machine-only)",
        actors = {Actor.ActorType.MACHINE})
    @PostMapping("/v1/tenants/{tenantId}/verification")
    public TenantVerificationService.VerificationReceipt record(
            @PathVariable("tenantId") UUID tenantId,
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        Actor actor = actor(request);

        String verdict = asString(body.get("verdict"));
        UUID approvalId = parseUuid(body.get("approvalId"), "approvalId");
        String payloadHash = asString(body.get("payloadHash"));

        if (verdict == null || verdict.isBlank()) {
            throw ApiException.badRequest("VERIFICATION_INVALID", "verdict is required");
        }
        if (approvalId == null) {
            throw ApiException.badRequest("VERIFICATION_INVALID", "approvalId is required");
        }
        if (payloadHash == null || payloadHash.isBlank()) {
            throw ApiException.badRequest("VERIFICATION_INVALID", "payloadHash is required");
        }

        return service.record(tenantId, verdict, approvalId, payloadHash, actor);
    }

    private static Actor actor(HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null) throw ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        return actor;
    }

    private static UUID parseUuid(Object v, String field) {
        if (v == null) return null;
        try { return UUID.fromString(String.valueOf(v)); }
        catch (IllegalArgumentException e) {
            throw ApiException.badRequest("VERIFICATION_INVALID", field + " must be a UUID");
        }
    }

    private static String asString(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
