package com.fsp.plugin.kyc.repository;

import com.fsp.plugin.kyc.domain.KycUbo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface KycUboRepository extends JpaRepository<KycUbo, UUID> {
    List<KycUbo> findByCaseIdOrderByPersonNoAsc(UUID caseId);

    @Modifying
    @Transactional
    @Query("DELETE FROM KycUbo u WHERE u.caseId = ?1")
    void deleteByCaseId(UUID caseId);
}
