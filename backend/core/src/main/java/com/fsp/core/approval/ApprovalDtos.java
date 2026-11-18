package com.fsp.core.approval;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ApprovalDtos {

    private ApprovalDtos() {}

    public record OpenRequest(String operationType, UUID targetResourceId) {}

    public record DecisionBody(String reason) {}

    public record QueueView(UUID id, UUID tenantId, String operationType, UUID targetResourceId,
                            String status, UUID makerId, UUID checkerId, String reason,
                            Instant requestedAt, Instant decidedAt) {}
}
