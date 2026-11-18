package com.fsp.core.plugin.registry;

import com.fsp.core.approval.ApprovalHandler;
import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Bridges PLUGIN_REGISTER approval resolution to the plugin registry domain.
 * When the checker approves, the plugin type transitions to REGISTERED.
 */
@Slf4j
@Component
public class PluginRegisterApprovalHandler implements ApprovalHandler {

    private final PluginRegistryService service;

    // @Lazy: ApprovalService → handlers → this service → ApprovalService (opening approvals) is a cycle
    public PluginRegisterApprovalHandler(@org.springframework.context.annotation.Lazy PluginRegistryService service) {
        this.service = service;
    }

    @Override
    public String operationType() {
        return ApprovalRequest.OpType.PLUGIN_REGISTER;
    }

    @Override
    public void apply(ApprovalRequest approval, boolean approved, Actor checker, String reason) {
        if (!approved) {
            log.info("plugin_register_rejected approvalId={} type=PLUGIN_REGISTER target={} reason={}",
                approval.id, approval.targetResourceId, reason);
            return;
        }
        // The targetResourceId is the PluginType id; look it up
        var type = service.findById(approval.targetResourceId);
        if (type == null) {
            throw new IllegalStateException("PluginType not found for approval %s".formatted(approval.id));
        }
        service.approve(type.code, type.version, checker);
    }

    // Helper: find by id (not exposed on the service interface; use the repository via service)
    // Kept simple: the service's find is by code+version. We need by-id. Add findById to service.
}
