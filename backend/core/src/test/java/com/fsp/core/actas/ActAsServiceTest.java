package com.fsp.core.actas;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fsp.core.audit.AuditService;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.rbac.PermissionService;
import com.fsp.core.tenant.Tenant;
import com.fsp.core.tenant.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Unit tests for ActAsService: start/exit, subtree boundary, permission gate, expiry. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ActAsServiceTest {

    private static final UUID PLATFORM = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID PSP = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final UUID TENANT = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static final UUID SIBLING = UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static final UUID PERSON = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Mock ActAsRepository sessions;
    @Mock TenantRepository tenants;
    @Mock PermissionService permissions;
    @Mock AuditService audit;
    @Mock JdbcTemplate jdbc;

    ActAsService service;

    @BeforeEach
    void setUp() {
        service = new ActAsService(sessions, tenants, permissions, audit, jdbc, true);
    }

    private Actor platformActor() {
        return new Actor(PERSON, "ravi", PLATFORM, Actor.ActorType.PERSON, null);
    }

    private Tenant tenant(UUID id, UUID parent, String path, String status) {
        Tenant t = new Tenant();
        t.id = id;
        t.parentTenantId = parent;
        t.hierarchyPath = path;
        t.status = status;
        t.legalName = "Tenant " + id;
        return t;
    }

    @Test
    void startSucceedsWhenPermittedAndBelowHome() {
        doNothing().when(permissions).require(any(), eq("tenant.act_as"), eq(PLATFORM));
        when(tenants.findById(TENANT)).thenReturn(Optional.of(tenant(TENANT, PSP,
            "/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/" + TENANT, "ACTIVE")));
        when(tenants.findById(PLATFORM)).thenReturn(Optional.of(tenant(PLATFORM, null,
            "/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "ACTIVE")));
        when(sessions.findLiveByPerson(PERSON)).thenReturn(List.of());
        when(jdbc.update(anyString(), any(), any(), any(), any(), any(), any())).thenReturn(1);
        when(audit.hashState(anyString())).thenReturn("hash");
        when(sessions.findById(anyString())).thenAnswer(inv -> {
            ActAsSession s = new ActAsSession(inv.getArgument(0), PERSON, PLATFORM, TENANT,
                Instant.now().plusSeconds(3600));
            return java.util.Optional.of(s);
        });

        ActAsService.ActAsView view = service.start(platformActor(), TENANT);

        assertThat(view.sessionId()).isNotNull();
        assertThat(view.personId()).isEqualTo(PERSON);
        assertThat(view.homeTenantId()).isEqualTo(PLATFORM);
        assertThat(view.targetTenantId()).isEqualTo(TENANT);
        verify(audit).record(eq(PERSON), isNull(), eq(PLATFORM), isNull(),
            eq("ACT_AS_START"), eq("TENANT"), eq(TENANT.toString()), isNull(), anyString(), eq(false),
            eq(PLATFORM), anyString());
    }

    @Test
    void startRefusedWhenTargetIsHomeTenant() {
        doNothing().when(permissions).require(any(), eq("tenant.act_as"), eq(PLATFORM));
        when(tenants.findById(PLATFORM)).thenReturn(Optional.of(tenant(PLATFORM, null,
            "/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "ACTIVE")));

        assertThatThrownBy(() -> service.start(platformActor(), PLATFORM))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("TENANT_NOT_FOUND"));
    }

    @Test
    void startRefusedWhenTargetIsParentNotBelowHome() {
        // From PSP, PLATFORM is the parent, not a descendant — acting as it should be refused.
        doNothing().when(permissions).require(any(), eq("tenant.act_as"), eq(PSP));
        when(tenants.findById(PLATFORM)).thenReturn(Optional.of(tenant(PLATFORM, null,
            "/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "ACTIVE")));

        assertThatThrownBy(() -> service.start(new Actor(PERSON, "ravi", PSP, Actor.ActorType.PERSON, null), PLATFORM))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("TENANT_NOT_FOUND"));
    }

    @Test
    void startRefusedWhenTargetNotActive() {
        doNothing().when(permissions).require(any(), eq("tenant.act_as"), eq(PLATFORM));
        when(tenants.findById(TENANT)).thenReturn(Optional.of(tenant(TENANT, PSP,
            "/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/" + TENANT, "SUSPENDED")));

        assertThatThrownBy(() -> service.start(platformActor(), TENANT))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("TENANT_CLOSED"));
    }

    @Test
    void endLiveEndsSession() {
        ActAsSession s = new ActAsSession("sess-1", PERSON, PLATFORM, TENANT,
            Instant.now().plusSeconds(3600));
        when(sessions.findLiveByPerson(PERSON)).thenReturn(List.of(s));
        when(audit.hashState(anyString())).thenReturn("hash");

        service.end(platformActor());

        verify(sessions).endAllForPerson(any(), eq("exit"), eq(PERSON));
        verify(audit).record(eq(PERSON), isNull(), eq(PLATFORM), isNull(),
            eq("ACT_AS_END"), eq("TENANT"), eq(TENANT.toString()), isNull(), anyString(), eq(false),
            eq(PLATFORM), eq("sess-1"));
    }

    @Test
    void currentReturnsNullWhenNoSession() {
        when(sessions.findLiveByPerson(PERSON)).thenReturn(List.of());

        assertThat(service.current(platformActor())).isNull();
    }

    @Test
    void liveReturnsNullForExpiredSession() {
        ActAsSession expired = new ActAsSession("sess-exp", PERSON, PLATFORM, TENANT,
            Instant.now().minusSeconds(100000));
        when(sessions.findLiveByIdAndPerson("sess-exp", PERSON)).thenReturn(Optional.of(expired));

        assertThat(service.live("sess-exp", PERSON)).isNull();
    }
}
