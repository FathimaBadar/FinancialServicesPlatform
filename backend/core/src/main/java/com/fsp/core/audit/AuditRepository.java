package com.fsp.core.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface AuditRepository extends JpaRepository<AuditRecord, Long> {

    Page<AuditRecord> findByTenantIdOrderByTimestampUtcDesc(UUID tenantId, Pageable pageable);
}
