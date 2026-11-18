package com.fsp.plugin.kyc.domain;

import com.fsp.plugin.kyc.api.ApiProblemException;

import java.math.BigDecimal;
import java.util.regex.Pattern;

/** Namibian field validation rules (plugin copy — plugin does not import core).
 *  FIA Act 13 of 2012 / FIC GN 01/2025. Volume fields are internal risk appetite only. */
public final class NamibiaRules {

    private NamibiaRules() {}

    public static final BigDecimal UBO_THRESHOLD_PCT = new BigDecimal("25.00");

    private static final Pattern BIPA = Pattern.compile("^([A-Z]{2})?\\d{3,10}$");
    private static final Pattern TIN = Pattern.compile("^\\d{8}$");
    private static final Pattern BRANCH = Pattern.compile("^\\d{5,6}$");

    public static String normalizeRegistration(String raw) {
        if (raw == null) return null;
        return raw.replaceAll("[\\s./-]", "").toUpperCase();
    }

    public static void requireBipaRegistration(String raw) {
        String norm = normalizeRegistration(raw);
        if (norm == null || !BIPA.matcher(norm).matches()) {
            throw new ApiProblemException("KYC_INVALID_REGISTRATION",
                "BIPA registration must match ^([A-Z]{2})?\\d{3,10}$ after normalization", 400);
        }
    }

    public static void requireTin(String raw) {
        if (raw == null || !TIN.matcher(raw.trim()).matches()) {
            throw new ApiProblemException("KYC_INVALID_TIN", "NamRA tax number must be 8 digits", 400);
        }
    }

    public static void requireBranchCode(String raw) {
        if (raw == null || !BRANCH.matcher(raw.trim()).matches()) {
            throw new ApiProblemException("KYC_INVALID_BRANCH", "Branch code must be 5-6 digits", 400);
        }
    }

    public static void requireUboThreshold(java.util.List<BigDecimal> ownershipPcts) {
        boolean covered = ownershipPcts.stream()
            .anyMatch(p -> p != null && p.compareTo(UBO_THRESHOLD_PCT) >= 0);
        if (!covered) {
            throw new ApiProblemException("KYC_UBO_THRESHOLD",
                "No beneficial owner holds >= 25%% ownership/voting rights", 400);
        }
    }

    public static void requireNonBlank(String value, String code, String message) {
        if (value == null || value.isBlank()) throw new ApiProblemException(code, message, 400);
    }
}
