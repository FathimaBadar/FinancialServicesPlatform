package com.fsp.core.ledger;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AccountingPeriodRepository extends JpaRepository<AccountingPeriod, UUID> {
    List<AccountingPeriod> findByBookIdOrderByFiscalYearDescPeriodNoDesc(UUID bookId);
}
