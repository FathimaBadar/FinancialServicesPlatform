package com.fsp.core.journal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "journal_lines")
public class JournalLine {

    @Id
    public UUID id;
    @Column(name = "entry_id", nullable = false)
    public UUID entryId;
    @Column(name = "line_no", nullable = false)
    public int lineNo;
    @Column(name = "gl_account_id", nullable = false)
    public UUID glAccountId;
    @Column(nullable = false)
    public String direction; // DEBIT | CREDIT
    @Column(nullable = false)
    public BigDecimal amount;
    public String memo;
}
