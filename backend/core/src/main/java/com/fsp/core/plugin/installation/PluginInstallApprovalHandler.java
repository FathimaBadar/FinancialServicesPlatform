package com.fsp.core.plugin.installation;

import com.fsp.core.approval.ApprovalHandler;
import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.common.Actor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Bridges PLUGIN_INSTALL approval resolution to the plugin installation domain.
 * When the checker approves, the installation transitions to PROVISIONING.
 */
@Slf4j
@Component
public class PluginInstallApprovalHandler implements ApprovalHandler {

    private final PluginInstallationService service;

    // @Lazy: ApprovalService → handlers → this service → ApprovalService (opening approvals) is a cycle
    public PluginInstallApprovalHandler(@org.springframework.context.annotation.Lazy PluginInstallationService service) {
        this.service = service;
    }

    @Override
    public String operationType() {
        return ApprovalRequest.OpType.PLUGIN_INSTALL;
    }

    @Override
    public void apply(ApprovalRequest approval, boolean approved, Actor checker, String reason) {
        if (!approved) {
            log.info("plugin_install_rejected approvalId={} target={} reason={}",
                approval.id, approval.targetResourceId, reason);
            return;
        }
        service.approve(approval.targetResourceId, checker);
    }
}
