package com.fsp.core.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "books")
public class Book {

    @Id
    public UUID id;
    @Column(name = "tenant_id", nullable = false)
    public UUID tenantId;
    @Column(nullable = false)
    public String name;
    @Column(nullable = false, length = 3)
    public String currency;
    @Column(name = "ledger_id", nullable = false)
    public int ledgerId;
    @Column(nullable = false)
    public String status; // SUSPENDED | ACTIVE | CLOSED
    @Column(name = "created_at", nullable = false, updatable = false)
    public Instant createdAt = Instant.now();
}
