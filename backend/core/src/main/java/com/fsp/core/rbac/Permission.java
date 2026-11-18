package com.fsp.core.rbac;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Global append-only permission catalog. */
@Entity
@Table(name = "permissions")
public class Permission {

    @Id
    public String key;
    @Column(nullable = false)
    public String title;
    @Column(nullable = false)
    public String risk;       // READ | WRITE | FOUR_EYES
    @Column(nullable = false)
    public String component;
}
