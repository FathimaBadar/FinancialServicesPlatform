package com.fsp.core.identity;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Wire records for organization user administration (AGENTS §2b: records in a final container). */
public final class UserDtos {

    private UserDtos() {}

    /** Role reference as rendered on a user row. */
    public record RoleRef(UUID id, String key, String name) {}

    /** One person of an organization. Never carries credentials. */
    public record UserView(UUID id, UUID tenantId, String username, String fullName, String email,
                           String phone, String status, boolean isApplicant, boolean checker, List<RoleRef> roles,
                           long version, Instant createdAt, Instant updatedAt, Instant archivedAt) {}

    /** A role the organization defines, plus whether THIS actor may grant/revoke it. */
    public record RoleOption(UUID id, String key, String name, String scope, int permissionCount,
                             boolean assignable) {}

    /** checker: may resolve four-eyes approvals (docs/checker-flag.md); null = false. */
    public record CreateUser(String username, String fullName, String email, String phone,
                             List<UUID> roleIds, Boolean checker) {}

    /** Partial update; null fields are left unchanged. roleIds == null keeps current roles. */
    public record UpdateUser(String fullName, String email, String phone, List<UUID> roleIds,
                             Boolean checker, Long expectedVersion) {}

    /** Body of activate / deactivate. */
    public record Transition(Long expectedVersion) {}
}
