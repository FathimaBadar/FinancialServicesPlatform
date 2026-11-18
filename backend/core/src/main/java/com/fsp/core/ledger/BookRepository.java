package com.fsp.core.ledger;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BookRepository extends JpaRepository<Book, UUID> {
    List<Book> findByTenantIdOrderByCreatedAtAsc(UUID tenantId);
}
