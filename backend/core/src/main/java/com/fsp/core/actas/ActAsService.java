package com.fsp.core.actas;

import com.fsp.core.audit.AuditService;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.rbac.PermissionService;
import com.fsp.core.tenant.Tenant;
import com.fsp.core.tenant.TenantRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Act as a tenant below your own ("sudo into a tenant", plans/act-as-tenant-plan.md).
 *
 * <ul>
 *   <li>A1 - starting needs {@code tenant.act_as} held in the person's own right at their
 *       home tenant (never borrowed from a tenant they act as);</li>
 *   <li>the target must be strictly below the person's home tenant, and not suspended or deactivated;</li>
 *   <li>A6 - a session ends after 30 minutes idle, after 8 hours, on exit, or when another starts;</li>
 *   <li>A7 - start and end are audited with the real person; every action in between carries
 *       the session id (AuditService);</li>
 *   <li>A8 - act-as needs RBAC enforcement; while acting the ceiling cap prevents privilege escalation.</li>
 * </ul>
 */
@Slf4j
@Service
public class ActAsService {

    public static final String CELL = "tenant.act_as";
    static final Duration IDLE = Duration.ofMinutes(30);
    static final Duration MAX = Duration.ofHours(8);

    /** The live session as the portal shows it. */
    public record ActAsView(String sessionId, UUID personId, String personName,
                            UUID homeTenantId, String homeTenantName,
                            UUID targetTenantId, String targetTenantName,
                            List<PathStep> path, Instant expiresAt, Instant idleUntil) { }

    /** A step in the home › … › target chain. */
    public record PathStep(UUID tenantId, String name) { }

    /** A live session row, as the request filter needs it. */
    public record Live(String id, UUID personId, UUID homeTenantId, UUID targetTenantId) { }

    private static final RowMapper<ActAsSession> SESSION_MAPPER = (rs, rowNum) -> {
        ActAsSession s = new ActAsSession();
        s.id = rs.getString("id");
        s.personId = UUID.fromString(rs.getString("person_id"));
        s.homeTenantId = UUID.fromString(rs.getString("home_tenant_id"));
        s.targetTenantId = UUID.fromString(rs.getString("target_tenant_id"));
        s.startedAt = rs.getTimestamp("started_at").toInstant();
        s.lastSeenAt = rs.getTimestamp("last_seen_at").toInstant();
        s.expiresAt = rs.getTimestamp("expires_at").toInstant();
        if (rs.getTimestamp("ended_at") != null) s.endedAt = rs.getTimestamp("ended_at").toInstant();
        s.endReason = rs.getString("end_reason");
        return s;
    };

    private final ActAsRepository sessions;
    private final TenantRepository tenants;
    private final PermissionService permissions;
    private final AuditService audit;
    private final JdbcTemplate db;
    private final boolean enabled;

    public ActAsService(ActAsRepository sessions, TenantRepository tenants,
                        PermissionService permissions, AuditService audit,
                        JdbcTemplate db,
                        @Value("${fsp.act-as.enabled:false}") boolean enabled) {
        this.sessions = sessions;
        this.tenants = tenants;
        this.permissions = permissions;
        this.audit = audit;
        this.db = db;
        this.enabled = enabled;
    }

    // ------------------------------------------------------------------ start / end / current

    @Transactional
    public ActAsView start(Actor caller, UUID targetTenantId) {
        if (!enabled) {
            throw ApiException.forbidden("ACT_AS_OFF", "Acting as a tenant is switched off");
        }
        UUID personId = caller.personId();
        if (personId == null) {
            throw ApiException.forbidden("ACT_AS_NO_PERSON", "Only persons can act as a tenant");
        }
        UUID home = homeTenantId(caller);
        if (home == null) {
            throw ApiException.forbidden("ACT_AS_NO_HOME", "You belong to no tenant");
        }
        // Permission check at the HOME tenant (never borrowed from an acted-as tenant)
        permissions.require(caller, CELL, home);

        Tenant target = tenants.findById(targetTenantId)
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Tenant not found"));
        // Strictly below the home tenant: never yourself, a sibling, a parent, or another branch.
        if (home.equals(targetTenantId) || !isDescendantOf(home, target.hierarchyPath)) {
            throw ApiException.notFound("TENANT_NOT_FOUND", "Tenant not found");
        }
        if (!"ACTIVE".equals(target.status)) {
            throw ApiException.conflict("TENANT_CLOSED", "This tenant is " + target.status);
        }

        // One live session per person: a new one ends the previous one.
        endLive(personId, "replaced", caller);

        String id = UUID.randomUUID().toString();
        Instant now = Instant.now();
        db.update("""
                INSERT INTO act_as_sessions (id, person_id, home_tenant_id, target_tenant_id,
                                             started_at, last_seen_at, expires_at)
                VALUES (?,?,?,?,?,?,?)""",
            id, personId, home, targetTenantId,
            java.sql.Timestamp.from(now), java.sql.Timestamp.from(now),
            java.sql.Timestamp.from(now.plus(MAX)));

        audit.record(personId, null, home, null,
            "ACT_AS_START", "TENANT", targetTenantId.toString(),
            null, audit.hashState("home=" + home + ";target=" + targetTenantId),
            false, home, id);

        return view(id, caller);
    }

    @Transactional
    public void end(Actor caller) {
        endLive(caller.personId(), "exit", caller);
    }

    /** The caller's live session, or null. */
    public ActAsView current(Actor caller) {
        UUID personId = caller.personId();
        if (personId == null) return null;
        List<ActAsSession> live = sessions.findLiveByPerson(personId);
        if (live.isEmpty()) return null;
        Live l = live(live.get(0).id, personId);
        return l == null ? null : view(l.id(), caller);
    }

    // ------------------------------------------------------------------ per request (ActAsFilter)

    /**
     * The live session {@code id} of {@code personId}, touched; null when unknown, someone else's,
     * ended, idle too long or past its maximum (and then ended as "expired").
     */
    @Transactional
    public Live live(String id, UUID personId) {
        if (id == null || personId == null) return null;
        var opt = sessions.findLiveByIdAndPerson(id, personId);
        if (opt.isEmpty()) return null;
        ActAsSession s = opt.get();
        Instant now = Instant.now();
        if (now.isAfter(s.expiresAt) || now.isAfter(s.lastSeenAt.plus(IDLE))) {
            db.update("UPDATE act_as_sessions SET ended_at=?, end_reason='expired' WHERE id=? AND ended_at IS NULL",
                java.sql.Timestamp.from(now), id);
            audit.record(personId, null, s.homeTenantId, null,
                "ACT_AS_END", "TENANT", s.targetTenantId.toString(),
                null, audit.hashState("session=" + id + " expired"), false);
            return null;
        }
        // Touch at most once a minute: one write per minute, not per request.
        if (now.isAfter(s.lastSeenAt.plusSeconds(60))) {
            db.update("UPDATE act_as_sessions SET last_seen_at=? WHERE id=?",
                java.sql.Timestamp.from(now), id);
            s.lastSeenAt = now;
        }
        return new Live(s.id, s.personId, s.homeTenantId, s.targetTenantId);
    }

    // ------------------------------------------------------------------ helpers

    /** The person's own tenant, never the one they act as.
     *  While already acting, home is stored in RequestCorrelation. */
    private UUID homeTenantId(Actor caller) {
        UUID home = com.fsp.core.common.RequestCorrelation.homeTenantId();
        if (home != null) return home;
        return caller.activeTenantId();
    }

    private boolean isDescendantOf(UUID ancestor, String descendantPath) {
        if (descendantPath == null) return false;
        String token = "/" + ancestor + "/";
        return descendantPath.contains(token) || descendantPath.equals("/" + ancestor);
    }

    private void endLive(UUID personId, String reason, Actor caller) {
        List<ActAsSession> toEnd = new ArrayList<>(sessions.findLiveByPerson(personId));
        sessions.endAllForPerson(Instant.now(), reason, personId);
        for (ActAsSession s : toEnd) {
            audit.record(personId, null, s.homeTenantId, null,
                "ACT_AS_END", "TENANT", s.targetTenantId.toString(),
                null, audit.hashState("session=" + s.id + " ended (" + reason + ")"),
                false, s.homeTenantId, s.id);
        }
    }

    private ActAsView view(String id, Actor caller) {
        ActAsSession s = sessions.findById(id)
            .orElseThrow(() -> ApiException.notFound("ACT_AS_SESSION_NOT_FOUND", "Session not found"));
        Tenant homeTenant = tenants.findById(s.homeTenantId)
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Home tenant not found"));
        Tenant targetTenant = tenants.findById(s.targetTenantId)
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Target tenant not found"));

        // Build the path home › … › target from hierarchy_path
        List<PathStep> path = new ArrayList<>();
        String[] parts = targetTenant.hierarchyPath.replaceFirst("^/", "").split("/");
        for (String part : parts) {
            try {
                UUID tid = UUID.fromString(part);
                Tenant t = tenants.findById(tid).orElse(null);
                if (t != null) {
                    path.add(new PathStep(t.id, t.legalName));
                }
            } catch (IllegalArgumentException ignored) {}
        }
        // Trim path to start at home
        int homeIdx = -1;
        for (int i = 0; i < path.size(); i++) {
            if (path.get(i).tenantId().equals(s.homeTenantId)) { homeIdx = i; break; }
        }
        if (homeIdx >= 0) path = path.subList(homeIdx, path.size());

        Instant seen = s.lastSeenAt;
        return new ActAsView(id, s.personId,
            caller.username() == null ? "" : caller.username(),
            s.homeTenantId, homeTenant.legalName,
            s.targetTenantId, targetTenant.legalName,
            path, s.expiresAt, seen.plus(IDLE));
    }
}
