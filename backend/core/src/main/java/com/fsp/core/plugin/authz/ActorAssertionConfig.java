package com.fsp.core.plugin.authz;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fsp.shared.ActorAssertion;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Core VERIFIES actor assertions; it never holds the signing key (plan §4.5: the gateway is
 * the only issuer). The gateway's public JWKS is fetched lazily and re-fetched when an
 * assertion names an unknown kid (key rotation), at most once per 30 s.
 *
 * Budget: one assertion may be presented to core a few times — the onboarding saga makes
 * several on-behalf calls for ONE person request (create child tenant, open approval).
 */
@Slf4j
@Configuration
public class ActorAssertionConfig {

    static final int ON_BEHALF_BUDGET = 5;

    @Bean
    public ActorAssertion actorAssertionVerifier(
            @Value("${fsp.gateway.actor-jwks-url:http://localhost:8090/.well-known/fsp-actor-jwks}") String jwksUrl) {
        GatewayKeys keys = new GatewayKeys(jwksUrl);
        return ActorAssertion.verifier(keys::resolve, ON_BEHALF_BUDGET);
    }

    /** kid → JWK cache over the gateway's published actor JWKS. */
    static final class GatewayKeys {
        private final String url;
        private final RestClient rest = RestClient.create();
        private final ObjectMapper mapper = new ObjectMapper();
        private final Map<String, JsonNode> byKid = new ConcurrentHashMap<>();
        private volatile long lastFetch;

        GatewayKeys(String url) {
            this.url = url;
        }

        JsonNode resolve(String kid) {
            JsonNode k = byKid.get(kid);
            if (k != null) return k;
            long now = System.currentTimeMillis();
            if (now - lastFetch < 30_000 && !byKid.isEmpty()) return null;
            lastFetch = now;
            try {
                JsonNode root = mapper.readTree(rest.get().uri(url).retrieve().body(String.class));
                root.path("keys").forEach(j -> byKid.put(j.path("kid").asText(), j));
                log.info("actor_jwks_loaded url={} keys={}", url, byKid.size());
            } catch (Exception e) {
                log.warn("actor_jwks_fetch_failed url={} detail={}", url, e.getMessage());
            }
            return byKid.get(kid);
        }
    }
}
