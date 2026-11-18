package com.fsp.core.ledger;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GlAccountRepository extends JpaRepository<GlAccount, UUID> {
    List<GlAccount> findByBookIdOrderByCodeAsc(UUID bookId);
    Optional<GlAccount> findByBookIdAndCode(UUID bookId, int code);
}
