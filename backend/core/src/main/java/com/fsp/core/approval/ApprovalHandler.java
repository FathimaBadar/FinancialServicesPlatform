package com.fsp.core.approval;

import com.fsp.core.common.Actor;

/**
 * Domain effect of a resolved approval. Handlers are looked up by
 * {@link ApprovalRequest.OpType}; a type with no handler is evidence-only.
 */
public interface ApprovalHandler {

    /** Operation type handled (from OpType). */
    String operationType();

    /** Apply the resolved decision to the owning domain. Must be transactional-safe. */
    void apply(ApprovalRequest approval, boolean approved, Actor checker, String reason);
}
