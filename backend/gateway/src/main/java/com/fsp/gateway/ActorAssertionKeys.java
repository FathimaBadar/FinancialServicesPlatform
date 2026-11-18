package com.fsp.gateway;

import com.fsp.shared.ActorAssertion;
import com.fsp.shared.Es256;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Path;
import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Map;

/**
 * The gateway is the ONLY holder of the actor-assertion private key (plugin-platform-plan
 * §4.5). Core and plugins verify against the public key published here — a public key, so the
 * endpoint is unauthenticated, exactly like the IdP's /idp/jwks.
 */
@Configuration
public class ActorAssertionKeys {

    private static final Logger log = LoggerFactory.getLogger(ActorAssertionKeys.class);

    @Bean
    public ActorAssertion actorAssertionIssuer(GatewayProperties props) {
        Path pem = Path.of(props.getAssertionKey());
        KeyPair kp = Es256.loadOrCreate(pem, props.isAssertionKeyCreate());
        ActorAssertion issuer = ActorAssertion.issuer((ECPrivateKey) kp.getPrivate(), (ECPublicKey) kp.getPublic());
        log.info("gateway_assertion_key_loaded kid={} file={}", issuer.kid(), pem.toAbsolutePath().normalize());
        return issuer;
    }

    @RestController
    public static class JwksEndpoint {
        private final ActorAssertion issuer;

        public JwksEndpoint(ActorAssertion issuer) {
            this.issuer = issuer;
        }

        @GetMapping("/.well-known/fsp-actor-jwks")
        public Map<String, Object> jwks() {
            return issuer.publicJwks();
        }
    }
}
