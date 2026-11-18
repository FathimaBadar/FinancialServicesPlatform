package com.fsp.core.approval;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ApprovalRequestRepository extends JpaRepository<ApprovalRequest, UUID> {
    List<ApprovalRequest> findByTenantIdOrderByRequestedAtDesc(UUID tenantId);
    List<ApprovalRequest> findByTenantIdAndStatusOrderByRequestedAtDesc(UUID tenantId, String status);
    Optional<ApprovalRequest> findByOperationTypeAndTargetResourceId(String operationType, UUID targetResourceId);

    /** A target (e.g. a reused layout draft row) may carry many resolved approvals; ask only about live ones. */
    boolean existsByOperationTypeAndTargetResourceIdAndStatus(String operationType, UUID targetResourceId, String status);
}
