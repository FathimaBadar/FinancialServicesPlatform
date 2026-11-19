package com.fsp.core.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Persons. Collection reads go through {@link JpaSpecificationExecutor#findAll(
 * org.springframework.data.jpa.domain.Specification, org.springframework.data.domain.Pageable)}
 * so search / filter / sort / paging all execute in PostgreSQL (AGENTS §2f).
 */
public interface PersonRepository extends JpaRepository<Person, UUID>, JpaSpecificationExecutor<Person> {

    Optional<Person> findByUsernameIgnoreCase(String username);

    boolean existsByUsername(String username);

    /** One row per status of an organization's persons — the user-list filter counts. */
    @Query("select p.status as status, count(p) as n from Person p where p.tenantId = :tenantId group by p.status")
    List<StatusCount> countByStatus(@Param("tenantId") UUID tenantId);

    interface StatusCount {
        String getStatus();
        long getN();
    }
}
