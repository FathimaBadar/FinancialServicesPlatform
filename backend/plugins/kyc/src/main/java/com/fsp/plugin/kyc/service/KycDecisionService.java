package com.fsp.plugin.kyc.service;

import com.fsp.plugin.kyc.api.ApiProblemException;
import com.fsp.plugin.kyc.api.KycDtos;
import com.fsp.plugin.kyc.domain.KycCase;
import com.fsp.plugin.kyc.domain.KycDecision;
import com.fsp.plugin.kyc.repository.KycCaseRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Decision service — wraps the onboarding saga's decide logic with the plugin's API contract. */
@Slf4j
@Service
public class KycDecisionService {

    private final KycOnboardingSagaService sagaService;
    private final KycCaseRepository caseRepository;

    public KycDecisionService(KycOnboardingSagaService sagaService, KycCaseRepository caseRepository) {
        this.sagaService = sagaService;
        this.caseRepository = caseRepository;
    }

    @Transactional
    public KycCase decide(UUID caseId, UUID ownerTenantId, UUID checkerPersonId,
                          KycDtos.DecisionBody body, String actorAssertion, String machineToken,
                          Long expectedVersion) {
        KycCase c = caseRepository.findById(caseId)
            .orElseThrow(() -> new ApiProblemException("KYC_CASE_NOT_FOUND", "Case not found", 404));

        if (!c.ownerTenantId.equals(ownerTenantId)) {
            throw new ApiProblemException("KYC_ACCESS_DENIED", "Case not accessible", 403);
        }

        KycDtos.DecisionBody.DecisionValue decision;
        try {
            decision = KycDtos.DecisionBody.DecisionValue.valueOf(body.decision());
        } catch (IllegalArgumentException e) {
            throw new ApiProblemException("KYC_INVALID_DECISION", "decision must be APPROVE, REJECT or REQUEST_INFO", 400);
        }

        String reason = body.reason();
        if ((decision == KycDtos.DecisionBody.DecisionValue.REJECT
             || decision == KycDtos.DecisionBody.DecisionValue.REQUEST_INFO)
            && (reason == null || reason.isBlank())) {
            throw new ApiProblemException("KYC_REASON_REQUIRED", "reason is required for " + decision, 400);
        }

        KycDecision kycDecision = switch (decision) {
            case APPROVE -> new KycDecision.Approved(c.id, c.riskRating != null ? c.riskRating : "MEDIUM");
            case REJECT -> new KycDecision.Rejected(reason);
            case REQUEST_INFO -> new KycDecision.RequestInfo(reason);
        };

        return sagaService.decide(c.id, ownerTenantId, checkerPersonId, kycDecision,
            actorAssertion, machineToken, expectedVersion);
    }
}
