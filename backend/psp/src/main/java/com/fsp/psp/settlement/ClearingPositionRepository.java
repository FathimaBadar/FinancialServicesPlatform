package com.fsp.psp.settlement;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ClearingPositionRepository extends JpaRepository<ClearingPosition, UUID> {

    Optional<ClearingPosition> findByConnectorCodeAndCurrencyAndPositionDate(
        String connectorCode, String currency, java.time.LocalDate positionDate);
}
