package com.fsp.plugin.kyc.repository;

import com.fsp.plugin.kyc.domain.IdempotencyRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface IdempotencyRecordRepository extends JpaRepository<IdempotencyRecord, UUID> {
    Optional<IdempotencyRecord> findByPersonIdAndRequestKey(UUID personId, String requestKey);
}
