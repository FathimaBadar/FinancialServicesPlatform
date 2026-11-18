package com.fsp.plugin.kyc.repository;

import com.fsp.plugin.kyc.domain.KycCheck;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface KycCheckRepository extends JpaRepository<KycCheck, UUID> {
    List<KycCheck> findByCaseIdOrderByCheckedAtDesc(UUID caseId);
}
