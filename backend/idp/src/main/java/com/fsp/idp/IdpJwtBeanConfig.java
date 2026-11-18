package com.fsp.idp;

import com.fsp.shared.JwtService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * One shared JwtService bean for the IdP (PAR client-assertion validation and
 * token issuance use the same RS256 key + issuer). Built from IdpProperties the
 * same way IdpTokenService resolves its signing key.
 */
@Configuration
public class IdpJwtBeanConfig {

    @Bean
    public JwtService jwtService(IdpProperties props) {
        JwtService jwt = new JwtService(resolveSigningKey(props.getSigningKeyPath()), props.getIssuer());
        if (!jwt.canSign()) {
            throw new IllegalStateException("idp_signing_key_missing run 'make pki' (idp-signing.pem)");
        }
        return jwt;
    }

    /** Signing key lookup: configured path → repo-root fallback (launcher cwd-independent). */
    private static java.nio.file.Path resolveSigningKey(String configured) {
        java.util.List<java.nio.file.Path> candidates = java.util.List.of(
            java.nio.file.Path.of(configured),
            java.nio.file.Path.of("infrastructure/pki/dev/idp-signing.pem"),
            java.nio.file.Path.of("/home/arun/FinancialServicesPlatform/infrastructure/pki/dev/idp-signing.pem"));
        return candidates.stream().filter(java.nio.file.Files::exists).findFirst()
            .orElse(java.nio.file.Path.of(configured));
    }
}