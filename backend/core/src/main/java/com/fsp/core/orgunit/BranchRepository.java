package com.fsp.core.orgunit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface BranchRepository extends JpaRepository<Branch, UUID> {

    /** Tenant-scoped page; status + q (code or name, case-insensitive; "" = all) pushed to SQL (AGENTS §2f).
     *  q is never null: a null bind has no SQL type for LIKE in PostgreSQL (text ~~ bytea). */
    @Query("""
        select b from Branch b
        where b.tenantId = :tenantId
          and (:status is null or b.status = :status)
          and (lower(b.name) like concat('%', :q, '%') or lower(b.code) like concat('%', :q, '%'))
        """)
    Page<Branch> search(@Param("tenantId") UUID tenantId, @Param("status") String status,
                        @Param("q") String q, Pageable pageable);

    boolean existsByTenantIdAndStatus(UUID tenantId, String status);
}
