package com.fsp.core.ui;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UiLayoutRepository extends JpaRepository<UiLayout, java.util.UUID> {

    Optional<UiLayout> findFirstByPortalAndStatus(String portal, String status);

    List<UiLayout> findAllByPortalAndStatus(String portal, String status);
}
