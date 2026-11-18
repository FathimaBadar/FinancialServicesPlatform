package com.fsp.idp;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "fsp.idp")
public final class IdpProperties {
    private String issuer = "https://idp.fsp.local";
    private long accessTokenTtlSeconds = 900;
    private String signingKeyPath = "../infrastructure/pki/dev/idp-signing.pem";
    private String internalCredential = "dev-internal-credential";

    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }
    public long getAccessTokenTtlSeconds() { return accessTokenTtlSeconds; }
    public void setAccessTokenTtlSeconds(long v) { this.accessTokenTtlSeconds = v; }
    public String getSigningKeyPath() { return signingKeyPath; }
    public void setSigningKeyPath(String p) { this.signingKeyPath = p; }
    public String getInternalCredential() { return internalCredential; }
    public void setInternalCredential(String c) { this.internalCredential = c; }
}
