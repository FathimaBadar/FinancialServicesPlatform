package com.fsp.core.tenant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tenants")
public class Tenant {

    @Id
    public UUID id;
    @Column(name = "parent_tenant_id")
    public UUID parentTenantId;
    @Column(name = "hierarchy_path", nullable = false)
    public String hierarchyPath;
    @Column(nullable = false)
    public int depth;
    @Column(nullable = false)
    public String type;            // PLATFORM | PSP | TENANT
    @Column(name = "sub_type")
    public String subType;         // MANUFACTURER | DISTRIBUTOR | DEALER | WHOLESALER | MERCHANT
    @Column(nullable = false)
    public String status;
    @Column(name = "verification_status", nullable = false)
    public String verificationStatus;
    @Column(name = "legal_name")
    public String legalName;
    @Column(name = "created_by")
    public UUID createdBy;
    @Column(name = "activated_by")
    public UUID activatedBy;
    @Column(nullable = false)
    public long version;
    @Column(name = "created_at", nullable = false, updatable = false)
    public Instant createdAt = Instant.now();

    public boolean isAncestorOf(Tenant other) {
        return other.hierarchyPath.startsWith(this.hierarchyPath + "/") && !other.id.equals(this.id);
    }
}
