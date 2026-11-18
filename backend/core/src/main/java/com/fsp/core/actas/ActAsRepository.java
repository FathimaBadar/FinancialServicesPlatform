package com.fsp.core.actas;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ActAsRepository extends JpaRepository<ActAsSession, String> {

    Optional<ActAsSession> findById(String id);

    @Query("""
        SELECT s FROM ActAsSession s
        WHERE s.id = ?1 AND s.personId = ?2 AND s.endedAt IS NULL
        """)
    Optional<ActAsSession> findLiveByIdAndPerson(String id, UUID personId);

    @Query("""
        SELECT s FROM ActAsSession s
        WHERE s.personId = ?1 AND s.endedAt IS NULL
        """)
    List<ActAsSession> findLiveByPerson(UUID personId);

    @Modifying
    @Transactional
    @Query("""
        UPDATE ActAsSession s SET s.endedAt = ?1, s.endReason = ?2
        WHERE s.personId = ?3 AND s.endedAt IS NULL
        """)
    int endAllForPerson(Instant endedAt, String endReason, UUID personId);
}
