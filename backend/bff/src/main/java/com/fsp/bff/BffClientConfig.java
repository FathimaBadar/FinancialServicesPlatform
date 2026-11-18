package com.fsp.bff;

import org.springframework.boot.ssl.SslBundle;
import org.springframework.boot.ssl.SslBundles;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.web.client.RestClient;

/**
 * Outbound transport: the BFF talks ONLY to the api gateway (AGENTS.md §4c topology).
 * Without the tls profile, plain HTTP to the gateway (dev); with it, the BFF presents its
 * workload mTLS identity (guide §2 internal hop).
 */
@Configuration
public class BffClientConfig {

    @Bean
    @Primary
    public RestClient gatewayRestClient(BffProperties props, ObjectProvider<SslBundles> bundles) {
        RestClient.Builder builder = RestClient.builder().baseUrl(props.getGateway().getBaseUrl());
        SslBundles sslBundles = bundles.getIfAvailable();
        if (sslBundles != null && sslBundles.getBundleNames().contains("bff-mtls")) {
            SslBundle bundle = sslBundles.getBundle("bff-mtls");
            var httpClient = java.net.http.HttpClient.newBuilder()
                .sslContext(bundle.createSslContext())
                .build();
            builder.requestFactory(new org.springframework.http.client.JdkClientHttpRequestFactory(httpClient));
            org.slf4j.LoggerFactory.getLogger(BffClientConfig.class)
                .warn("bff_outbound_mtls bundle=bff-mtls active");
        } else {
            org.slf4j.LoggerFactory.getLogger(BffClientConfig.class)
                .debug("bff_outbound_plaintext (no bff-mtls bundle — run the tls profile for mTLS)");
        }
        return builder.build();
    }
}
