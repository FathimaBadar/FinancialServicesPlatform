package com.fsp.plugin.kyc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * fsp-plugin-kyc — the first plugin on the FSP plugin platform.
 *
 * Contract (AGENTS.md plugin-platform-plan §10):
 *  - Serves ONLY manifest operations under /v1/plugins/kyc/*
 *  - Verifies the gateway actor assertion on every inbound request
 *  - Outbound only via the gateway (machine tokens + DPoP + actor assertions)
 *  - Owns its own DB (fsp_plugin_kyc); never touches core's DB or TigerBeetle
 *  - Data rows carry owner_tenant_id / subject_tenant_id; queries always scoped
 */
@SpringBootApplication
@EnableScheduling
public class KycPluginApplication {

    public static void main(String[] args) {
        SpringApplication.run(KycPluginApplication.class, args);
    }
}
