package com.fsp.idp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/** Read-only projection of a canonical person — the credential store row owned by the IdP. */
@Entity
@Table(name = "persons")
public class PPerson {

    @Id
    public UUID id;
    @Column(name = "tenant_id", nullable = false)
    public UUID tenantId;
    @Column(nullable = false, unique = true)
    public String username;
    @Column(name = "full_name", nullable = false)
    public String fullName;
    @Column(name = "password_hash", nullable = false)
    public String passwordHash;
    @Column(nullable = false)
    public String status;
    @Column(name = "is_applicant", nullable = false)
    public boolean isApplicant;
}
