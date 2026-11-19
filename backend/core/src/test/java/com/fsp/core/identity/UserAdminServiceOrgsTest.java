package com.fsp.core.identity;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fsp.core.approval.ApprovalService;
import com.fsp.core.audit.AuditService;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.config.FspProperties;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.rbac.PermissionService;
import com.fsp.core.rbac.RbacRepository;
import com.fsp.core.rbac.RoleRepository;
import com.fsp.core.tenant.Tenant;
import com.fsp.core.tenant.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Gap probe — user-management Phase B: the organization picker.
 *
 * <p>Before: the SPA built the picker by calling {@code /children} for the root and again for every
 * child (N+1, unbounded, no search), and showed orgs where the actor could not manage users at
 * all. Now ONE paged, searchable call lists the descendants of the actor's org, each flagged
 * {@code manageable} by core (the PDP), and the users page names the org it lists.
 */
class UserAdminServiceOrgsTest {

    private static final UUID ROOT = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID CHILD_OK = UUID.fromString("10000000-0000-0000-0000-000000000002");
    private static final UUID CHILD_NO = UUID.fromString("10000000-0000-0000-0000-000000000003");
    private static final UUID ADMIN = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");

    private TenantRepository tenants;
    private PersonRepository persons;
    private PermissionService permissions;
    private UserAdminService svc;

    @BeforeEach
    void setUp() {
        tenants = mock(TenantRepository.class);
        persons = mock(PersonRepository.class);
        permissions = mock(PermissionService.class);
        RoleRepository roles = mock(RoleRepository.class);
        RbacRepository rbac = mock(RbacRepository.class);

        Tenant root = tenant(ROOT, "/" + ROOT, 1, "PSP", "Acme PSP");
        lenient().when(tenants.existsById(any())).thenReturn(true);
        lenient().when(tenants.findById(ROOT)).thenReturn(Optional.of(root));
        lenient().doNothing().when(permissions).require(any(Actor.class), anyString(), eq(ROOT));
        lenient().when(permissions.effectiveKeys(any(Actor.class), eq(CHILD_OK))).thenReturn(Set.of("user.manage"));
        lenient().when(permissions.effectiveKeys(any(Actor.class), eq(CHILD_NO))).thenReturn(Set.of("audit.view"));
        lenient().when(persons.countByStatus(any())).thenReturn(List.of());
        lenient().when(roles.findByTenantId(any())).thenReturn(List.of());

        svc = new UserAdminService(persons, mock(PersonProvisioning.class), roles, rbac, tenants, permissions,
            mock(AuditService.class), mock(OutboxService.class), mock(ApprovalService.class),
            new ObjectMapper(), new FspProperties());
    }

    @SuppressWarnings("unchecked")
    private ArgumentCaptor<Pageable> stubDescendants(List<Tenant> rows, long total) {
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        when(tenants.findAll(any(Specification.class), pageable.capture()))
            .thenAnswer(inv -> new PageImpl<>(rows, inv.getArgument(1), total));
        return pageable;
    }

    @Test
    void listsDescendantsAsOnePagedSearchableCallFlaggedByCore() {
        ArgumentCaptor<Pageable> pageable = stubDescendants(List.of(
            tenant(CHILD_OK, "/" + ROOT + "/" + CHILD_OK, 2, "TENANT", "Coastal Distributors"),
            tenant(CHILD_NO, "/" + ROOT + "/" + CHILD_NO, 2, "TENANT", "North Wholesalers")), 42);

        UserDtos.OrgPage page = svc.orgs(ROOT, admin(), "coast", 0, 20);

        assertThat(page.totalElements()).isEqualTo(42);
        assertThat(page.hasNext()).isTrue();
        assertThat(page.items()).extracting(UserDtos.OrgOption::legalName)
            .containsExactly("Coastal Distributors", "North Wholesalers");
        assertThat(page.items()).extracting(UserDtos.OrgOption::manageable).containsExactly(true, false);
        Sort sort = pageable.getValue().getSort();
        assertThat(sort.getOrderFor("depth")).isNotNull();
        assertThat(sort.getOrderFor("legalName")).isNotNull();
        assertThat(sort.getOrderFor("id")).isNotNull();
    }

    @Test
    void pageSizeIsBounded() {
        ArgumentCaptor<Pageable> pageable = stubDescendants(List.of(), 0);
        svc.orgs(ROOT, admin(), null, -1, 5000);
        assertThat(pageable.getValue().getPageSize()).isEqualTo(100);
        assertThat(pageable.getValue().getPageNumber()).isZero();
    }

    @Test
    void needsUserManageOnTheRoot() {
        doThrow(ApiException.forbidden("PERMISSION_DENIED", "no"))
            .when(permissions).require(any(Actor.class), eq("user.manage"), eq(CHILD_NO));
        assertThatThrownBy(() -> svc.orgs(CHILD_NO, admin(), null, 0, 20)).isInstanceOf(ApiException.class);
    }

    /** The users page names the org it lists — no tenant-detail call (which needs other permissions). */
    @Test
    @SuppressWarnings("unchecked")
    void usersPageCarriesTheOrgItLists() {
        when(persons.findAll(any(Specification.class), any(Pageable.class)))
            .thenAnswer(inv -> new PageImpl<Person>(List.of(), inv.getArgument(1), 0));
        UserDtos.UserPage page = svc.list(ROOT, admin(), 0, 20, null, null, null);
        assertThat(page.org().id()).isEqualTo(ROOT);
        assertThat(page.org().legalName()).isEqualTo("Acme PSP");
        assertThat(page.org().type()).isEqualTo("PSP");
    }

    private static Tenant tenant(UUID id, String path, int depth, String type, String name) {
        Tenant t = new Tenant();
        t.id = id;
        t.hierarchyPath = path;
        t.depth = depth;
        t.type = type;
        t.status = "ACTIVE";
        t.verificationStatus = "VERIFIED";
        t.legalName = name;
        t.createdAt = Instant.now();
        return t;
    }

    private static Actor admin() {
        return new Actor(ADMIN, null, ROOT);
    }
}
