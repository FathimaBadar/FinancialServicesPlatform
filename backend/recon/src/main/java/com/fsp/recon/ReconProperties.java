package com.fsp.recon;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** recon-worker configuration (Stage 6; chapter 13 §8). */
@ConfigurationProperties(prefix = "fsp.recon")
public class ReconProperties {

    private long sweepIntervalMs = 60_000;
    private String emiBaseUrl = "http://localhost:8086";
    private String pspBaseUrl = "http://localhost:8085";
    private String coreBaseUrl = "http://localhost:8081";
    /** Internal-hop credential (must match the services' expected credential; §1.4). */
    private String internalCredential = "dev-internal-credential";
    /** Tenant the recon worker acts under (platform root). */
    private String platformTenantId = "00000000-0000-0000-0000-000000000001";
    /** P0 dedupe window: the same violation key pages at most once per window. */
    private Duration pageDedup = Duration.ofHours(24);

    public long getSweepIntervalMs() { return sweepIntervalMs; }
    public void setSweepIntervalMs(long v) { this.sweepIntervalMs = v; }
    public String getEmiBaseUrl() { return emiBaseUrl; }
    public void setEmiBaseUrl(String v) { this.emiBaseUrl = v; }
    public String getPspBaseUrl() { return pspBaseUrl; }
    public void setPspBaseUrl(String v) { this.pspBaseUrl = v; }
    public String getCoreBaseUrl() { return coreBaseUrl; }
    public void setCoreBaseUrl(String v) { this.coreBaseUrl = v; }
    public String getInternalCredential() { return internalCredential; }
    public void setInternalCredential(String v) { this.internalCredential = v; }
    public String getPlatformTenantId() { return platformTenantId; }
    public void setPlatformTenantId(String v) { this.platformTenantId = v; }
    public Duration getPageDedup() { return pageDedup; }
    public void setPageDedup(Duration v) { this.pageDedup = v; }
}
