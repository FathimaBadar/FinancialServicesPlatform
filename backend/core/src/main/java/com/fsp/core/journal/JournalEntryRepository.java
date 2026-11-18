package com.fsp.core.journal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface JournalEntryRepository extends JpaRepository<JournalEntry, UUID> {
    List<JournalEntry> findByTenantIdOrderByPostingDateDescCreatedAtDesc(UUID tenantId);
    List<JournalEntry> findByTenantIdAndStatus(UUID tenantId, String status);
    Optional<JournalEntry> findByIdAndTenantId(UUID id, UUID tenantId);
}
