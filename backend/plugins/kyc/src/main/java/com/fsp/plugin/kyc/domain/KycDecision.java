package com.fsp.plugin.kyc.domain;

import java.util.UUID;

/** Sealed KYC decision outcome — consumed exhaustively by KycDecisionService (AGENTS §2b). */
public sealed interface KycDecision permits KycDecision.Approved, KycDecision.Rejected, KycDecision.RequestInfo {

    record Approved(UUID caseId, String riskRating) implements KycDecision {}
    record Rejected(String reason) implements KycDecision {}
    record RequestInfo(String reason) implements KycDecision {}
}
