package com.fsp.core.identity;

import com.fsp.core.approval.ApprovalHandler;
import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.common.Actor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * Applies an approved {@code USER_CREATE} decision: activates the person and grants roles.
 * ObjectProvider breaks the ApprovalService → handler → UserAdminService bean cycle.
 */
@Slf4j
@Component
public class UserCreateApprovalHandler implements ApprovalHandler {

    private final ObjectProvider<UserAdminService> users;

    public UserCreateApprovalHandler(ObjectProvider<UserAdminService> users) {
        this.users = users;
    }

    @Override
    public boolean atomicWithResolution() {
        return true; // DB-only: the person change commits with the approval row or not at all
    }

    @Override
    public String operationType() {
        return ApprovalRequest.OpType.USER_CREATE;
    }

    @Override
    public void apply(ApprovalRequest approval, boolean approved, Actor checker, String reason) {
        if (!approved) {
            log.info("user_create_rejected approvalId={} target={} checker={}", approval.id,
                approval.targetResourceId, checker.personId());
            return;
        }
        users.getObject().applyCreate(approval.targetResourceId, approval.payload, checker.personId(), reason);
    }
}
