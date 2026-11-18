package com.fsp.core.identity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PersonRepository extends JpaRepository<Person, UUID> {

    Optional<Person> findByUsernameIgnoreCase(String username);

    boolean existsByUsername(String username);

    /** Bounded listing of one organization's persons (guide §4A: explicit budget). */
    java.util.List<Person> findByTenantIdOrderByUsernameAsc(UUID tenantId,
                                                           org.springframework.data.domain.Pageable page);
}
