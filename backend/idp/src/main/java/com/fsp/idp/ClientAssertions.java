package com.fsp.idp;

import com.fsp.shared.JwtService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

/**
 * FAPI 2.0 private_key_jwt client-assertion validation (RFC 7523).
 * The BFF signs an ES256 assertion whose header embeds its public EC JWK —
 * the IdP verifies the signature against that JWK and binds the assertion
 * to the issuer (aud = issuer string). Key registration is a hardening slice;
 * this keeps the trust seam in one place.
 */
final class ClientAssertions {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ClientAssertions() {}

    /** jti -> exp (epoch s): a client assertion is single-use (RFC 7523 §3 item 7). */
    private static final java.util.concurrent.ConcurrentHashMap<String, Long> SEEN_JTI =
        new java.util.concurrent.ConcurrentHashMap<>();

    /**
     * Machine clients (FAPI 2.0 §5.3.3 private_key_jwt): the assertion MUST verify against a
     * key REGISTERED for the client (oauth_clients.jwks) — never against a key the assertion
     * carries itself — and is single-use (jti). aud = issuer string only.
     *
     * @return the client id when valid, else null.
     */
    static String validateRegistered(String assertion, String expectedIssuer, String clientId, String registeredJwks) {
        try {
            String[] parts = assertion.split("\\.");
            if (parts.length != 3) return null;
            JsonNode header = MAPPER.readTree(Base64.getUrlDecoder().decode(parts[0]));
            JsonNode payload = MAPPER.readTree(Base64.getUrlDecoder().decode(parts[1]));
            if (!"ES256".equals(header.path("alg").asText())) return null;

            JsonNode keys = MAPPER.readTree(registeredJwks).path("keys");
            String kid = header.path("kid").asText("");
            JsonNode key = null;
            for (JsonNode k : keys) {
                if (!"EC".equals(k.path("kty").asText()) || !k.path("d").isMissingNode()) continue;
                if (kid.isEmpty() ? keys.size() == 1 : kid.equals(k.path("kid").asText())) key = k;
            }
            if (key == null || !JwtService.verifyEs256(key, parts[0] + "." + parts[1], parts[2])) return null;

            long now = Instant.now().getEpochSecond();
            long exp = payload.path("exp").asLong(0);
            long iat = payload.path("iat").asLong(0);
            if (now > exp || iat > now + 60 || exp - iat > 300) return null;
            if (!clientId.equals(payload.path("iss").asText()) || !clientId.equals(payload.path("sub").asText())) return null;
            JsonNode aud = payload.path("aud");
            if (!aud.isTextual() || !expectedIssuer.equals(aud.asText())) return null;
            String jti = payload.path("jti").asText("");
            if (jti.isBlank() || SEEN_JTI.putIfAbsent(clientId + ":" + jti, exp) != null) return null;
            if (SEEN_JTI.size() > 10_000) SEEN_JTI.entrySet().removeIf(e -> e.getValue() < now);
            return clientId;
        } catch (Exception e) {
            return null;
        }
    }

    /** @return the client id (assertion iss/sub) if the assertion is valid, else null. */
    static String validate(String assertion, String expectedIssuer) {
        if (assertion == null || assertion.isBlank()) {
            return null;
        }
        try {
            String[] parts = assertion.split("\\.");
            if (parts.length != 3) {
                return null;
            }
            JsonNode header = MAPPER.readTree(Base64.getUrlDecoder().decode(parts[0]));
            JsonNode payload = MAPPER.readTree(Base64.getUrlDecoder().decode(parts[1]));

            if (!"ES256".equals(header.path("alg").asText())
                || !"JWT".equalsIgnoreCase(header.path("typ").asText("JWT"))) {
                return null;
            }
            JsonNode jwk = header.path("jwk");
            if (jwk.isMissingNode() || !jwk.path("d").isMissingNode()) {
                // private key material in an assertion header is never acceptable
                return null;
            }
            String input = parts[0] + "." + parts[1];
            if (!JwtService.verifyEs256(jwk, input, parts[2])) {
                return null;
            }
            // exp/iat bounded (5 min)
            long now = Instant.now().getEpochSecond();
            if (now > payload.path("exp").asLong() || now < payload.path("iat").asLong() - 60) {
                return null;
            }
            String iss = payload.path("iss").asText();
            if (iss.isBlank() || !iss.equals(payload.path("sub").asText())) {
                return null;
            }
            // aud MUST equal the issuer string (FAPI 2.0 — array form is rejected)
            JsonNode aud = payload.path("aud");
            if (!aud.isTextual() || !expectedIssuer.equals(aud.asText())) {
                return null;
            }
            return iss;
        } catch (Exception e) {
            return null;
        }
    }
}