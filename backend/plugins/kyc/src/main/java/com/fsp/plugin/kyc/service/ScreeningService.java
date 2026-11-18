package com.fsp.plugin.kyc.service;

import com.fsp.plugin.kyc.domain.KycCheck;
import com.fsp.plugin.kyc.domain.KycDecision;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** Simulated screening provider (Phase-0). Real providers drop in via the provider port later. */
@Slf4j
@Service
public class ScreeningService {

    public record Check(UUID id, UUID caseId, UUID ownerTenantId, String checkType, String result, String details) {}

    public Check runIdentity(UUID caseId, UUID ownerTenantId, String requestedOutcome) {
        Check check = new Check(UUID.randomUUID(), caseId, ownerTenantId, "IDENTITY",
            normalize(requestedOutcome), "Simulated identity verification (sandbox)");
        recordOutcome(check);
        return check;
    }

    public Check runSanctions(UUID caseId, UUID ownerTenantId, String requestedOutcome) {
        Check check = new Check(UUID.randomUUID(), caseId, ownerTenantId, "SANCTIONS",
            normalize(requestedOutcome), "Simulated sanctions screening (sandbox)");
        recordOutcome(check);
        return check;
    }

    private void recordOutcome(Check check) {
        switch (check.result()) {
            case "FAIL", "MANUAL_REVIEW" -> log.warn("kyc_screening_negative caseId={} type={} result={}",
                check.caseId(), check.checkType(), check.result());
            default -> log.debug("kyc_screening_clean caseId={} type={} result={}",
                check.caseId(), check.checkType(), check.result());
        }
    }

    private String normalize(String requested) {
        if (requested == null || requested.isBlank()) return "PASS";
        return switch (requested.toUpperCase()) {
            case "PASS", "FAIL", "MANUAL_REVIEW" -> requested.toUpperCase();
            default -> "PASS";
        };
    }
}
