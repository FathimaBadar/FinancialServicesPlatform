package com.fsp.idp;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PPersonRepository extends JpaRepository<PPerson, UUID> {
    Optional<PPerson> findByUsername(String username);
}
