package com.fsp.core.config;

import com.tigerbeetle.Client;
import com.tigerbeetle.UInt128;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;

/**
 * The ONLY place allowed to import com.tigerbeetle.* besides TbService (AGENTS.md §3.5).
 * tigerbeetle-java 0.17.9: Client(byte[] clusterId /*16 bytes*&#47;, String[] addresses).
 */
@Configuration
public class TigerBeetleConfig {

    private static final int CLUSTER_ID_BYTES = 16;

    @Bean(destroyMethod = "close")
    public Client tigerBeetleClient(FspProperties props) {
        var tb = props.getTigerBeetle();
        byte[] clusterId = UInt128.asBytes((long) tb.getClusterId());
        if (clusterId.length != CLUSTER_ID_BYTES) {
            throw new IllegalStateException("cluster id encoding failed"); // impossible; belt & braces
        }
        String[] addresses = Arrays.stream(tb.getAddresses().split(","))
            .map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
        return new Client(clusterId, addresses);
    }
}
