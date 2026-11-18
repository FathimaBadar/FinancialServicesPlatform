package com.fsp.core.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "fsp")
public class FspProperties {

    private final Security security = new Security();
    private final TigerBeetle tigerbeetle = new TigerBeetle();
    private final Journal journal = new Journal();
    private final Ui ui = new Ui();

    public Security getSecurity() { return security; }
    public TigerBeetle getTigerBeetle() { return tigerbeetle; }
    public Journal getJournal() { return journal; }
    public Ui getUi() { return ui; }

    public static class Security {
        private String internalCredential = "dev-internal-credential";
        private String defaultPersonPassword = "fsp-person-2026";

        public String getInternalCredential() { return internalCredential; }
        public void setInternalCredential(String v) { this.internalCredential = v; }
        public String getDefaultPersonPassword() { return defaultPersonPassword; }
        public void setDefaultPersonPassword(String v) { this.defaultPersonPassword = v; }
    }

    public static class TigerBeetle {
        private int clusterId = 0;
        private String addresses = "127.0.0.1:3000";

        public int getClusterId() { return clusterId; }
        public void setClusterId(int v) { this.clusterId = v; }
        public String getAddresses() { return addresses; }
        public void setAddresses(String v) { this.addresses = v; }
    }

    /** Test hooks for the uncertain-commit recovery harness (never true in prod). */
    public static class Journal {
        private boolean forceUnknown = false;

        public boolean isForceUnknown() { return forceUnknown; }
        public void setForceUnknown(boolean v) { this.forceUnknown = v; }
    }

    /** Signed portal delivery (plans/signed-portal-delivery-plan.md). Private key is
     *  mounted like the IdP signing key (AGENTS.md §7) — never shipped, never logged. */
    public static class Ui {
        private String signingKeyPath = "infrastructure/pki/dev/ui-builder-signing.pem";
        private String signingKid = "ui-builder-dev-1";
        private String alg = "ES256";

        public String getSigningKeyPath() { return signingKeyPath; }
        public void setSigningKeyPath(String v) { this.signingKeyPath = v; }
        public String getSigningKid() { return signingKid; }
        public void setSigningKid(String v) { this.signingKid = v; }
        public String getAlg() { return alg; }
        public void setAlg(String v) { this.alg = v; }
    }
}
