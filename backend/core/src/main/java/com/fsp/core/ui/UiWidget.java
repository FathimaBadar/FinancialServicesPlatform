package com.fsp.core.ui;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * A registered UI widget (plans/widget-harness-prd.md §3). Registration is idempotent on
 * the widget id — re-registering bumps the version under optimistic locking.
 */
@Entity
@Table(name = "ui_widgets")
public class UiWidget {

    @Id
    public String id;                 // "<area>.<name>"
    @Column(nullable = false)
    public String version;
    @Column(nullable = false)
    public String label;
    @Column(nullable = false)
    public String category;
    @Column(nullable = false)
    public String bundle;             // built chunk path served by the SPA
    @Column(nullable = false, columnDefinition = "text")
    public String portals;            // JSON string array
    @Column(nullable = false, columnDefinition = "text")
    public String requires;           // JSON string array of permission cells
    @Column(name = "bundle_sha256", length = 80)
    public String bundleSha256;       // "sha256:<64 hex>" of the built asset chunk (S1)
    @Column(nullable = false)
    public String status;             // ACTIVE
    @Column(name = "registered_by", nullable = false)
    public UUID registeredBy;
    @Version
    @Column(name = "version_num", nullable = false)
    public long versionNum;
    @Column(nullable = false)
    public Instant createdAt;
    @Column(nullable = false)
    public Instant updatedAt;
}
