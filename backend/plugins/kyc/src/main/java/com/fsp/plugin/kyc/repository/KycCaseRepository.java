package com.fsp.plugin.kyc.repository;

import com.fsp.plugin.kyc.domain.KycCase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KycCaseRepository extends JpaRepository<KycCase, UUID> {

    Optional<KycCase> findByIdAndOwnerTenantId(UUID id, UUID ownerTenantId);

    List<KycCase> findByOwnerTenantIdOrderByUpdatedAtDesc(UUID ownerTenantId);

    List<KycCase> findBySubjectTenantId(UUID subjectTenantId);

    List<KycCase> findByStatusAndUpdatedAtBefore(String status, Instant before);

    @Query("SELECT count(c) > 0 FROM KycCase c WHERE c.ownerTenantId = :owner AND c.registrationNumber = :reg " +
           "AND c.status <> 'REJECTED'")
    boolean existsActiveRegistration(@Param("owner") UUID ownerTenantId, @Param("reg") String registrationNumber);
}
