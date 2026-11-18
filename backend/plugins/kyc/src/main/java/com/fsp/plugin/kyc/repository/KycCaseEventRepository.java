package com.fsp.plugin.kyc.repository;

import com.fsp.plugin.kyc.domain.KycCaseEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface KycCaseEventRepository extends JpaRepository<KycCaseEvent, UUID> {
    List<KycCaseEvent> findByCaseIdOrderByCreatedAtAsc(UUID caseId);
}
