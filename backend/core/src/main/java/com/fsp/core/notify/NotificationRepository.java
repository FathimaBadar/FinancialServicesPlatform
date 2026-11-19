package com.fsp.core.notify;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    List<Notification> findByPersonIdOrderByCreatedAtDesc(UUID personId);

    boolean existsByPersonIdAndTypeAndResourceId(UUID personId, String type, UUID resourceId);

    /** Self-service inbox semantics: one click marks the whole inbox read (queue is the truth). */
    @Modifying
    @Query("update Notification n set n.readAt = :at where n.personId = :personId and n.readAt is null")
    int markAllRead(@Param("personId") UUID personId, @Param("at") Instant at);

    @Query("select count(n) from Notification n where n.personId = :personId and n.readAt is null")
    long countUnread(@Param("personId") UUID personId);

    /** Push queue cursor: rows older than the settle window that no dispatcher has claimed. */
    @Query("""
        select n from Notification n
        where n.pushedAt is null and n.createdAt < :notNewerThan and n.pushAttempts < 3
        order by n.createdAt asc
        """)
    List<Notification> findPushPending(@Param("notNewerThan") Instant notNewerThan,
                                       org.springframework.data.domain.Pageable page);

    /** Claim: atomic move off NULL — safe if a future multi-replica dispatcher races. */
    @Modifying
    @Query("update Notification n set n.pushedAt = :at, n.pushVia = :via where n.id = :id and n.pushedAt is null")
    int claimPushed(@Param("id") UUID id, @Param("at") Instant at, @Param("via") String via);

    /** Bounded retry: bump attempts, leave the row queued. */
    @Modifying
    @Query("update Notification n set n.pushAttempts = n.pushAttempts + 1 where n.id = :id")
    int bumpAttempts(@Param("id") UUID id);
}
