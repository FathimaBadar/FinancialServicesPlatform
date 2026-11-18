package com.fsp.core.rbac;

import java.util.List;
import java.util.UUID;

/** Wire records for organization role governance (RoleAdminController). */
public final class RoleDtos {

    private RoleDtos() {}

    /**
     * A role as an organization sees it. {@code status} is {@code ACTIVE}, or
     * {@code PENDING_CREATE} for a creation still awaiting its checker (no row exists yet).
     * {@code pendingApprovalId}/{@code pendingOperation} name the open four-eyes request, if any.
     */
    public record RoleView(UUID id, UUID tenantId, String key, String name, String scope, String status,
                           List<String> permissionKeys, long version, int assignedCount, boolean protectedRole,
                           UUID pendingApprovalId, String pendingOperation) {}

    public record CreateRole(String key, String name, List<String> permissionKeys) {}

    public record UpdateRole(String name, List<String> permissionKeys, Long expectedVersion) {}

    /** Answer of every write: the change is STAGED, not applied (HTTP 202). */
    public record RoleChange(UUID pendingApprovalId, String operationType, UUID roleId, String status) {}

    /** Approval payload — the maker's proposal, re-validated against the checker on apply. */
    public record RoleProposal(String key, String name, List<String> permissionKeys, Long baseVersion) {}
}
