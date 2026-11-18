package com.fsp.gateway;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "fsp.gateway")
public final class GatewayProperties {
    private String coreBaseUrl = "http://localhost:8081";
    private String idpBaseUrl = "http://localhost:8082";
    private String issuer = "https://idp.fsp.local";
    private String audience = "fsp-financial-api";
    private String internalCredential = "dev-internal-credential";
    private int catalogRefreshSeconds = 60;
    private long maxBodyBytes = 1048576;
    /** PKCS#8 PEM with the P-256 key that signs actor assertions (dev: created on first boot). */
    private String assertionKey = "../../infrastructure/pki/dev/gateway-assertion.pem";
    private boolean assertionKeyCreate = true;

    public String getCoreBaseUrl() { return coreBaseUrl; }
    public void setCoreBaseUrl(String v) { this.coreBaseUrl = v; }
    public String getIdpBaseUrl() { return idpBaseUrl; }
    public void setIdpBaseUrl(String v) { this.idpBaseUrl = v; }
    public String getIssuer() { return issuer; }
    public void setIssuer(String v) { this.issuer = v; }
    public String getAudience() { return audience; }
    public void setAudience(String v) { this.audience = v; }
    public String getInternalCredential() { return internalCredential; }
    public void setInternalCredential(String v) { this.internalCredential = v; }
    public int getCatalogRefreshSeconds() { return catalogRefreshSeconds; }
    public void setCatalogRefreshSeconds(int v) { this.catalogRefreshSeconds = v; }
    public long getMaxBodyBytes() { return maxBodyBytes; }
    public void setMaxBodyBytes(long v) { this.maxBodyBytes = v; }
    public String getAssertionKey() { return assertionKey; }
    public void setAssertionKey(String v) { this.assertionKey = v; }
    public boolean isAssertionKeyCreate() { return assertionKeyCreate; }
    public void setAssertionKeyCreate(boolean v) { this.assertionKeyCreate = v; }
}
