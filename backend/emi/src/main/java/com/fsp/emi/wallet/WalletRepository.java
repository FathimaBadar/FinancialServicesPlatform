package com.fsp.emi.wallet;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {

    Optional<Wallet> findByWalletRef(String walletRef);

    Optional<Wallet> findByPersonIdAndCurrency(UUID personId, String currency);

    List<Wallet> findByStatus(String status);
}
