package com.fsp.core.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "fsp")
public class FspProperties {

    private final Security security = new Security();
    private final TigerBeetle tigerbeetle = new TigerBeetle();
    private final Journal journal = new Journal();
    private final Ui ui = new Ui();
    private final Push push = new Push();

    public Security getSecurity() { return security; }
    public TigerBeetle getTigerBeetle() { return tigerbeetle; }
    public Journal getJournal() { return journal; }
    public Ui getUi() { return ui; }
    public Push getPush() { return push; }

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

    /** F-12 push notifications (docs/architecture/12-notifications-and-push.md). Channel
     *  adapters are credential-gated: a channel with no credentials is simply ABSENT — no
     *  notification data ever leaves without the operator having provisioned keys
     *  (VAPID for Web Push, provider credentials for APNs/FCM). Keys are injected via env;
     *  never shipped, never logged. */
    public static class Push {
        private long dispatchFixedDelay = 2000;
        private boolean webpushEnabled = false;
        private String webpushSubject = "mailto:dev@fsp.local";
        private String webpushPublicKey = "";
        private String webpushPrivateKey = "";
        private boolean apnsEnabled = false;
        private String apnsHost = "api.push.apple.com";
        private String apnsTeamId = "";
        private String apnsKeyId = "";
        private String apnsKeyPem = "";
        private String apnsTopic = "";
        private boolean fcmEnabled = false;
        private String fcmProjectId = "";
        private String fcmCredentialsJson = "";

        public long getDispatchFixedDelay() { return dispatchFixedDelay; }
        public void setDispatchFixedDelay(long v) { this.dispatchFixedDelay = v; }
        public boolean isWebpushEnabled() { return webpushEnabled; }
        public void setWebpushEnabled(boolean v) { this.webpushEnabled = v; }
        public String getWebpushSubject() { return webpushSubject; }
        public void setWebpushSubject(String v) { this.webpushSubject = v; }
        public String getWebpushPublicKey() { return webpushPublicKey; }
        public void setWebpushPublicKey(String v) { this.webpushPublicKey = v; }
        public String getWebpushPrivateKey() { return webpushPrivateKey; }
        public void setWebpushPrivateKey(String v) { this.webpushPrivateKey = v; }
        public boolean isApnsEnabled() { return apnsEnabled; }
        public void setApnsEnabled(boolean v) { this.apnsEnabled = v; }
        public String getApnsHost() { return apnsHost; }
        public void setApnsHost(String v) { this.apnsHost = v; }
        public String getApnsTeamId() { return apnsTeamId; }
        public void setApnsTeamId(String v) { this.apnsTeamId = v; }
        public String getApnsKeyId() { return apnsKeyId; }
        public void setApnsKeyId(String v) { this.apnsKeyId = v; }
        public String getApnsKeyPem() { return apnsKeyPem; }
        public void setApnsKeyPem(String v) { this.apnsKeyPem = v; }
        public String getApnsTopic() { return apnsTopic; }
        public void setApnsTopic(String v) { this.apnsTopic = v; }
        public boolean isFcmEnabled() { return fcmEnabled; }
        public void setFcmEnabled(boolean v) { this.fcmEnabled = v; }
        public String getFcmProjectId() { return fcmProjectId; }
        public void setFcmProjectId(String v) { this.fcmProjectId = v; }
        public String getFcmCredentialsJson() { return fcmCredentialsJson; }
        public void setFcmCredentialsJson(String v) { this.fcmCredentialsJson = v; }
    }
}
