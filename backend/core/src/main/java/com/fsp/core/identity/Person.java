package com.fsp.core.identity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "persons")
public class Person {

    @Id
    public UUID id;
    @Column(name = "tenant_id", nullable = false)
    public UUID tenantId;
    @Column(nullable = false, unique = true)
    public String username;
    @Column(name = "full_name", nullable = false)
    public String fullName;
    public String email;
    public String phone;
    @Column(name = "password_hash", nullable = false)
    public String passwordHash;
    @Column(nullable = false)
    public String status; // ACTIVE | ARCHIVED | DISABLED
    @Column(name = "is_applicant", nullable = false)
    public boolean isApplicant;
    /** May resolve four-eyes approvals (docs/checker-flag.md). Checked in ApprovalService. */
    @Column(name = "is_checker", nullable = false)
    public boolean isChecker;
    @Column(name = "archived_at")
    public Instant archivedAt;
    @Version
    @Column(nullable = false)
    public long version;
    @Column(name = "created_at", nullable = false, updatable = false)
    public Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt = Instant.now();
}
