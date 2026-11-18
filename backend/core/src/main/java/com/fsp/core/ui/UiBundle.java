package com.fsp.core.ui;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A signed portal delivery bundle (plans/signed-portal-delivery-plan.md §4). Append-only;
 *  exactly one row per portal carries {@code current=true} (partial unique index, V10). */
@Entity
@Table(name = "ui_bundles")
public class UiBundle {

    @Id
    public UUID id;
    @Column(nullable = false, length = 40)
    public String portal;
    @Column(nullable = false)
    public boolean current;
    @Column(nullable = false, length = 80)
    public String kid;
    @Column(nullable = false, length = 16)
    public String alg;
    @Column(nullable = false, length = 80)
    public String digest;                 // "sha256:<hex>" over canonicalized payload
    @Column(nullable = false, columnDefinition = "text")
    public String payload;
    @Column(nullable = false, columnDefinition = "text")
    public String jws;
    @Column(name = "layout_id")
    public UUID layoutId;
    @Column(nullable = false)
    public Instant createdAt;
}
