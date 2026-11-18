package com.fsp.core.journal;

import com.fsp.core.approval.ApprovalHandler;
import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.common.Actor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * Bridges generic approval resolution to the journal domain (approve → post; reject → REJECTED).
 * ObjectProvider breaks the ApprovalService → handler → JournalService → ApprovalService cycle.
 */
@Slf4j
@Component
public class JournalApprovalHandler implements ApprovalHandler {

    private final ObjectProvider<JournalService> journal;

    public JournalApprovalHandler(ObjectProvider<JournalService> journal) {
        this.journal = journal;
    }

    @Override
    public String operationType() {
        return ApprovalRequest.OpType.JE_POSTING;
    }

    @Override
    public void apply(ApprovalRequest approval, boolean approved, Actor checker, String reason) {
        if (approved) {
            journal.getObject().approveAndPost(approval.tenantId, approval.targetResourceId, checker);
        } else {
            journal.getObject().rejectByChecker(approval.tenantId, approval.targetResourceId, checker, reason);
        }
    }
}
