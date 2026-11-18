package com.fsp.idp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/** Read-only projection of a tenant for policy resolution and token claims. */
@Entity
@Table(name = "tenants")
public class PTenant {

    @Id
    public UUID id;
    @Column(name = "parent_tenant_id")
    public UUID parentTenantId;
    @Column(name = "hierarchy_path", nullable = false)
    public String hierarchyPath;
    @Column(nullable = false)
    public String type;
    @Column(name = "sub_type")
    public String subType;
    @Column(nullable = false)
    public String status;
    @Column(name = "legal_name", nullable = false)
    public String legalName;
}
