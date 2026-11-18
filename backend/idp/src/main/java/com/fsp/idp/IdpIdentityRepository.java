package com.fsp.idp;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface IdpIdentityRepository extends JpaRepository<IdpIdentity, UUID> {
    Optional<IdpIdentity> findByIssuerAndSubject(String issuer, String subject);
}
