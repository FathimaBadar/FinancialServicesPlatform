package com.fsp.idp;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface PTenantRepository extends JpaRepository<PTenant, UUID> {
}
