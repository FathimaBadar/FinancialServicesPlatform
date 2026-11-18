package com.fsp.plugin.kyc.repository;

import com.fsp.plugin.kyc.domain.KycBankAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface KycBankAccountRepository extends JpaRepository<KycBankAccount, UUID> {
    List<KycBankAccount> findByCaseIdOrderByCreatedAtAsc(UUID caseId);

    @Modifying
    @Transactional
    @Query("DELETE FROM KycBankAccount b WHERE b.caseId = ?1")
    void deleteByCaseId(UUID caseId);
}
