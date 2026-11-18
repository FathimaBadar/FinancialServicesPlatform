package com.fsp.core.ui;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * A portal layout (plans/widget-harness-prd.md §3). JSON at the edge, text at rest — the
 * service validates structure on save. At most one DRAFT and one PUBLISHED row per portal
 * (partial unique indexes in V8). Publishing is a four-eyes approval on
 * {@code approval_requests} (OpType UI_LAYOUT_PUBLISH).
 */
@Entity
@Table(name = "ui_layouts")
public class UiLayout {

    public static final class Status {
        public static final String DRAFT = "DRAFT";
        public static final String PUBLISHED = "PUBLISHED";
    }

    @Id
    public UUID id;
    @Column(nullable = false)
    public String portal;
    @Column(nullable = false)
    public String status;
    @Column(name = "layout_json", nullable = false, columnDefinition = "text")
    public String layoutJson;
    @Column(name = "schema_version", nullable = false)
    public int schemaVersion;
    @Column(name = "maker_id", nullable = false)
    public UUID makerId;
    @Column(name = "published_approval_id")
    public UUID publishedApprovalId;
    @Version
    @Column(name = "version_num", nullable = false)
    public long versionNum;
    @Column(nullable = false)
    public Instant createdAt;
    @Column(nullable = false)
    public Instant updatedAt;
}
