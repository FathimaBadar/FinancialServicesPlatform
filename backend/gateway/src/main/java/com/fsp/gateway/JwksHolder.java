package com.fsp.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fsp.shared.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fetches and caches the IdP's JWKS; verifies Bearer tokens (RS256, iss+aud). Third-party
 * federation adds per-tenant JWKS fetchers keyed by issuer — the verify seam stays here.
 */
@Component
public class JwksHolder {

    private static final Logger log = LoggerFactory.getLogger(JwksHolder.class);

    private final GatewayProperties props;
    private final RestClient rest;
    private final ObjectMapper mapper = new ObjectMapper();
    private volatile Map<String, JsonNode> jwks = Map.of();

    public JwksHolder(GatewayProperties props) {
        this.props = props;
        this.rest = RestClient.create();
        int attempts = 30;
        for (int i = 0; i < attempts && jwks.isEmpty(); i++) {
            refresh();
            if (jwks.isEmpty()) {
                try {
                    Thread.sleep(2000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        if (jwks.isEmpty()) {
            throw new IllegalStateException("gateway_boot_failed_empty_jwks " + props.getIdpBaseUrl());
        }
    }

    public void refresh() {
        try {
            ResponseEntity<String> res = rest.method(HttpMethod.GET)
                .uri(props.getIdpBaseUrl() + "/idp/jwks")
                .retrieve().toEntity(String.class);
            if (res.getStatusCode().is2xxSuccessful() && res.getBody() != null) {
                jwks = JwtService.jwksMap(res.getBody());
                log.info("gateway_jwks_updated keys={}", jwks.size());
            } else {
                log.warn("gateway_jwks_fetch_failed status={}", res.getStatusCode().value());
            }
        } catch (Exception e) {
            log.warn("gateway_jwks_refresh_failed detail={}", e.getMessage());
        }
    }

    @Scheduled(fixedRate = 60000)
    public void scheduledRefresh() {
        refresh();
    }

    public JwtService verifier(String issuer) {
        return new JwtService(null, issuer);
    }

    public Map<String, JsonNode> jwks() {
        return jwks;
    }
}
