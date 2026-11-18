package com.fsp.core.rbac;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.approval.ApprovalRequestRepository;
import com.fsp.core.approval.ApprovalService;
import com.fsp.core.audit.AuditService;
import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.tenant.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** GAP-1: role changes are four-eyes, non-escalating, version-pinned. */
class RoleAdminServiceTest {

    private static final UUID TENANT = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final Actor MAKER = new Actor(UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), "maker", TENANT);
    private static final Actor CHECKER = new Actor(UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "checker", TENANT);

    private RoleRepository roles;
    private RbacRepository rbac;
    private RolePermissionRepository rolePermissions;
    private PermissionRepository catalog;
    private PermissionService permissions;
    private ApprovalService approvals;
    private ApprovalRequestRepository approvalRows;
    private final ObjectMapper mapper = new ObjectMapper();
    private RoleAdminService svc;
    private Role checkerRole;

    @BeforeEach
    void setUp() {
        roles = mock(RoleRepository.class);
        rbac = mock(RbacRepository.class);
        rolePermissions = mock(RolePermissionRepository.class);
        catalog = mock(PermissionRepository.class);
        TenantRepository tenants = mock(TenantRepository.class);
        permissions = mock(PermissionService.class);
        approvals = mock(ApprovalService.class);
        approvalRows = mock(ApprovalRequestRepository.class);
        svc = new RoleAdminService(roles, rbac, rolePermissions, catalog, tenants, permissions, approvals, approvalRows,
            mock(AuditService.class), mock(OutboxService.class), mapper);

        when(tenants.existsById(TENANT)).thenReturn(true);
        when(catalog.existsById(anyString())).thenAnswer(i -> !"bogus.key".equals(i.getArgument(0)));
        checkerRole = new Role();
        checkerRole.id = UUID.randomUUID();
        checkerRole.tenantId = TENANT;
        checkerRole.key = "TENANT_CHECKER";
        checkerRole.name = "Tenant Checker";
        checkerRole.scope = "TENANT";
        checkerRole.version = 3;
        when(roles.findById(checkerRole.id)).thenReturn(Optional.of(checkerRole));
        when(rbac.permissionKeysForRole(checkerRole.id)).thenReturn(List.of("je.approve", "kyc.approve"));
        when(approvalRows.findByTargetResourceIdAndStatus(any(), anyString())).thenReturn(List.of());
        when(approvalRows.findByTenantIdAndStatusOrderByRequestedAtDesc(any(), anyString())).thenReturn(List.of());
        when(permissions.effectiveKeys(any(), eq(TENANT))).thenReturn(Set.of("role.manage", "period.open", "je.approve", "kyc.approve"));
        when(approvals.open(any(), anyString(), any(), any(), anyString(), anyString())).thenAnswer(i -> {
            ApprovalRequest a = new ApprovalRequest();
            a.id = UUID.randomUUID();
            a.tenantId = i.getArgument(0);
            a.operationType = i.getArgument(1);
            a.targetResourceId = i.getArgument(2);
            a.payload = i.getArgument(5);
            a.makerId = MAKER.personId();
            return a;
        });
    }

    @Test
    void updateIsStagedNotApplied() {
        RoleDtos.RoleChange change = svc.requestUpdate(TENANT, checkerRole.id,
            new RoleDtos.UpdateRole(null, List.of("je.approve", "kyc.approve", "period.open"), 3L), MAKER);

        assertThat(change.operationType()).isEqualTo(ApprovalRequest.OpType.ROLE_UPDATE);
        assertThat(change.pendingApprovalId()).isNotNull();
        verify(rolePermissions, never()).save(any());
        verify(rolePermissions, never()).deleteById(any());
        verify(roles, never()).bumpVersion(any(), any(Long.class), anyString());
    }

    @Test
    void makerCannotGrantAKeyTheyDoNotHold() {
        assertThatThrownBy(() -> svc.requestUpdate(TENANT, checkerRole.id,
            new RoleDtos.UpdateRole(null, List.of("je.approve", "kyc.approve", "org.create"), 3L), MAKER))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("ROLE_NOT_ASSIGNABLE"));
    }

    @Test
    void unknownPermissionKeyIsRefused() {
        assertThatThrownBy(() -> svc.requestCreate(TENANT, new RoleDtos.CreateRole("AUDITOR", "Auditor", List.of("bogus.key")), MAKER))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("PERMISSION_UNKNOWN"));
    }

    @Test
    void staleExpectedVersionIsRefused() {
        assertThatThrownBy(() -> svc.requestUpdate(TENANT, checkerRole.id,
            new RoleDtos.UpdateRole(null, List.of("je.approve"), 2L), MAKER))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("STALE_WRITE"));
    }

    @Test
    void anchorRolesCannotBeDeleted() {
        assertThatThrownBy(() -> svc.requestDelete(TENANT, checkerRole.id, 3L, MAKER))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("ROLE_PROTECTED"));
    }

    @Test
    void assignedRoleCannotBeDeleted() {
        checkerRole.key = "AUDITOR";
        when(rbac.countByRoleId(checkerRole.id)).thenReturn(2L);
        assertThatThrownBy(() -> svc.requestDelete(TENANT, checkerRole.id, 3L, MAKER))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("ROLE_IN_USE"));
    }

    @Test
    void approvedUpdateAppliesExactlyTheDiffAndBumpsVersion() throws Exception {
        ApprovalRequest a = approval(ApprovalRequest.OpType.ROLE_UPDATE,
            new RoleDtos.RoleProposal("TENANT_CHECKER", "Tenant Checker", List.of("kyc.approve", "period.open"), 3L));
        when(roles.bumpVersion(checkerRole.id, 3L, "Tenant Checker")).thenReturn(1);

        svc.applyUpdate(a, CHECKER);

        ArgumentCaptor<RolePermission> granted = ArgumentCaptor.forClass(RolePermission.class);
        verify(rolePermissions).save(granted.capture());
        assertThat(granted.getValue().permissionKey).isEqualTo("period.open");
        verify(rolePermissions).deleteById(new RolePermissionId(checkerRole.id, "je.approve"));
        verify(roles).bumpVersion(checkerRole.id, 3L, "Tenant Checker");
    }

    @Test
    void approvalOfAChangeBasedOnAnOldVersionIsRefused() throws Exception {
        ApprovalRequest a = approval(ApprovalRequest.OpType.ROLE_UPDATE,
            new RoleDtos.RoleProposal("TENANT_CHECKER", "Tenant Checker", List.of("kyc.approve"), 2L));
        assertThatThrownBy(() -> svc.applyUpdate(a, CHECKER))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("STALE_WRITE"));
        verify(rolePermissions, never()).save(any());
    }

    @Test
    void checkerMustAlsoHoldTheKeysTheyApprove() throws Exception {
        when(permissions.effectiveKeys(eq(CHECKER), eq(TENANT))).thenReturn(Set.of("role.manage", "je.approve", "kyc.approve"));
        ApprovalRequest a = approval(ApprovalRequest.OpType.ROLE_UPDATE,
            new RoleDtos.RoleProposal("TENANT_CHECKER", "Tenant Checker", List.of("je.approve", "kyc.approve", "period.open"), 3L));
        assertThatThrownBy(() -> svc.applyUpdate(a, CHECKER))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("ROLE_NOT_ASSIGNABLE"));
    }

    private ApprovalRequest approval(String op, RoleDtos.RoleProposal p) throws Exception {
        ApprovalRequest a = new ApprovalRequest();
        a.id = UUID.randomUUID();
        a.tenantId = TENANT;
        a.operationType = op;
        a.targetResourceId = checkerRole.id;
        a.makerId = MAKER.personId();
        a.payload = mapper.writeValueAsString(p);
        return a;
    }
}
