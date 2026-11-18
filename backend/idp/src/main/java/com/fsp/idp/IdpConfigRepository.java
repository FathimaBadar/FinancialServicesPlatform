package com.fsp.idp;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface IdpConfigRepository extends JpaRepository<IdpConfig, UUID> {
    Optional<IdpConfig> findByTenantId(UUID tenantId);
}
