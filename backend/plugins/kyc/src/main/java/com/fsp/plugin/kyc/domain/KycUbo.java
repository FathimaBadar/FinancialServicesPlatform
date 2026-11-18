package com.fsp.plugin.kyc.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "kyc_ubos")
public class KycUbo {

    @Id
    public UUID id;

    @Column(name = "case_id", nullable = false)
    public UUID caseId;

    @Column(name = "owner_tenant_id", nullable = false)
    public UUID ownerTenantId;

    @Column(name = "person_no", nullable = false)
    public int personNo;

    @Column(name = "full_name", nullable = false)
    public String fullName;

    public LocalDate dob;

    public String nationality;

    @Column(name = "residential_address")
    public String residentialAddress;

    public String phone;

    public String email;

    @Column(name = "id_doc_type", nullable = false)
    public String idDocType;

    @Column(name = "id_number", nullable = false)
    public String idNumber;

    @Column(name = "id_expiry")
    public LocalDate idExpiry;

    @Column(name = "ownership_pct", nullable = false)
    public BigDecimal ownershipPct;

    @Column(name = "is_pep", nullable = false)
    public boolean isPep;

    public KycUbo() {}
}
