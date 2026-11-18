package com.fsp.core.tenant;

import java.time.Instant;
import java.util.UUID;

/** Wire DTOs for tenant management (AGENTS.md §2b: final container + records; never sealed). */
public final class TenantDtos {

    private TenantDtos() {}

    /** Platform admin creates a PSP with its maker + checker personnel (four-eyes ready). */
    public record CreatePspRequest(String legalName, String adminUsername, String adminFullName,
                                   String checkerUsername, String checkerFullName) {}

    public record TenantView(UUID id, UUID parentTenantId, String hierarchyPath, int depth,
                             String type, String subType, String status, String verificationStatus,
                             String legalName, Instant createdAt) {}

    public record PspCreated(UUID tenantId, String adminUsername, String checkerUsername,
                             String note) {}
}
