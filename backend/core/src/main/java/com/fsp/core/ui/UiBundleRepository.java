package com.fsp.core.ui;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UiBundleRepository extends JpaRepository<UiBundle, UUID> {

    Optional<UiBundle> findByPortalAndCurrentTrue(String portal);

    List<UiBundle> findByPortalOrderByCreatedAtDesc(String portal);

    /** Checkpoint iteration: every live bundle row (one per enrolled portal). */
    List<UiBundle> findAllByCurrentTrue();

    /** Demote a portal's current bundle to history (called before inserting the new current row). */
    @Modifying
    @Query("UPDATE UiBundle b SET b.current = false WHERE b.portal = :portal AND b.current = true")
    void markHistorical(@Param("portal") String portal);
}
