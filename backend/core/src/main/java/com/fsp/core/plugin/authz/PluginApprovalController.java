package com.fsp.core.plugin.authz;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.approval.ApprovalService;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import com.fsp.core.plugin.registry.PluginType;
import com.fsp.core.plugin.registry.PluginTypeRepository;
import com.fsp.core.rbac.PermissionService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * POST /v1/approvals/plugin — a plugin opens a four-eyes approval FOR a person (plan §7.1).
 * DELEGATED only: the person from the gateway's actor assertion is the maker (a machine can
 * never be a maker). The action must be declared in the plugin's four-eyes-approved
 * manifest ("approvals": [{action, makerPermission, checkerPermission}]); the maker
 * permission is required of BOTH the person and the plugin client. The approval type is
 * PLUGIN:&lt;code&gt;:&lt;action&gt;, attributed to the client.
 */
@Slf4j
@RestController
public class PluginApprovalController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ApprovalService approvals;
    private final PluginTypeRepository types;
    private final PermissionService permissions;

    public PluginApprovalController(ApprovalService approvals, PluginTypeRepository types,
                                    PermissionService permissions) {
        this.approvals = approvals;
        this.types = types;
        this.permissions = permissions;
    }

    @FspOperation(id = "approval.plugin.open", component = "approval", permission = "",
        risk = FspOperation.OperationRisk.WRITE,
        title = "Open a plugin-mediated four-eyes approval (delegated)",
        actors = {Actor.ActorType.DELEGATED})
    @PostMapping("/v1/approvals/plugin")
    public Map<String, Object> open(HttpServletRequest request, @RequestBody Map<String, Object> body) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null || actor.type() != Actor.ActorType.DELEGATED || actor.personId() == null) {
            throw ApiException.forbidden("ACTOR_TYPE_REJECTED", "plugin approvals are opened on behalf of a person");
        }
        String code = actor.clientId().substring("plugin-".length());
        String action = str(body.get("action"));
        UUID target = uuid(body.get("targetResourceId"));
        String payloadHash = str(body.get("payloadHash"));
        if (action == null || target == null || payloadHash == null) {
            throw ApiException.badRequest("APPROVAL_INVALID", "action, targetResourceId and payloadHash are required");
        }

        JsonNode declared = declaredApproval(code, action);
        String makerPermission = declared.path("makerPermission").asText();
        permissions.require(actor, makerPermission, actor.activeTenantId());
        permissions.requireClient(actor.clientId(), makerPermission, actor.activeTenantId());

        ApprovalRequest row = approvals.open(actor.activeTenantId(), "PLUGIN:" + code + ":" + action, target,
            actor, actor.personId(), "plugin %s %s %s".formatted(code, action, target), payloadHash,
            actor.clientId());
        log.info("plugin_approval_opened approvalId={} plugin={} action={} maker={} client={}",
            row.id, code, action, actor.personId(), actor.clientId());
        return Map.of("id", row.id, "status", row.status, "operationType", row.operationType,
            "payloadHash", row.payloadHash);
    }

    private JsonNode declaredApproval(String code, String action) {
        for (PluginType t : types.findByCodeAndStatus(code, "REGISTERED")) {
            try {
                for (JsonNode a : MAPPER.readTree(t.manifest).path("approvals")) {
                    if (action.equals(a.path("action").asText()) && !a.path("makerPermission").asText().isBlank()) {
                        return a;
                    }
                }
            } catch (Exception e) {
                log.warn("plugin_manifest_unreadable code={}", code);
            }
        }
        log.warn("plugin_approval_undeclared plugin={} action={}", code, action);
        throw ApiException.forbidden("APPROVAL_NOT_DECLARED",
            "Plugin %s does not declare approval action %s".formatted(code, action));
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static UUID uuid(Object v) {
        try {
            return v == null ? null : UUID.fromString(String.valueOf(v));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("APPROVAL_INVALID", "targetResourceId must be a UUID");
        }
    }
}
