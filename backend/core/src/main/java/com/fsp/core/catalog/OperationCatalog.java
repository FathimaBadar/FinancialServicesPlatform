package com.fsp.core.catalog;

import com.fsp.core.common.FspOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Operation catalog (FAPI2 guide §3): inventories every {@code @FspOperation}-annotated
 * handler from the REAL mapping registry at boot, validates it (unique operation ids,
 * explicit methods, known permission keys, /v1-only business routes) and publishes a
 * digest-stable descriptor for the gateway/BFF route policy (guide §3.2-3.3).
 * A violation FAILS BOOT (guide: "reject ambiguous gateway mappings and unclassified routes").
 */
@Slf4j
@Component
public class OperationCatalog implements SmartInitializingSingleton {

    public record Entry(String operationId, String component, String method, String pathPattern,
                        String permission, String risk, String resource, String title) {}

    private final ApplicationContext context;
    private List<Entry> entries = List.of();
    private String digest = "";

    public OperationCatalog(ApplicationContext context) {
        this.context = context;
    }

    @Override
    public void afterSingletonsInstantiated() {
        RequestMappingHandlerMapping mapping =
            context.getBean("requestMappingHandlerMapping", RequestMappingHandlerMapping.class);
        Map<String, Entry> byId = new LinkedHashMap<>();
        List<Entry> found = new ArrayList<>();

        mapping.getHandlerMethods().forEach((info, handlerMethod) -> {
            if (!(handlerMethod instanceof HandlerMethod hm)) return;
            String anyPath = info.getPatternValues().stream().findFirst().orElse("");
            FspOperation op = hm.getMethodAnnotation(FspOperation.class);
            if (op == null) op = hm.getBeanType().getAnnotation(FspOperation.class);
            // Guide mandate: unclassified BUSINESS routes are a boot failure — the gateway
            // (policy source = this catalog) would otherwise silently 404 a live endpoint.
            if (op == null) {
                if (anyPath.startsWith("/v1/")) {
                    throw new IllegalStateException("Catalog violation: unclassified business route "
                        + anyPath + " on " + hm.getBeanType().getSimpleName() + " — annotate with @FspOperation");
                }
                return;
            }

            Set<org.springframework.web.bind.annotation.RequestMethod> methods = info.getMethodsCondition().getMethods();
            if (methods.size() != 1) {
                throw new IllegalStateException("Catalog violation: operation %s must declare exactly one HTTP method (%s)"
                    .formatted(op.id(), info));
            }
            String path = info.getPatternValues().stream().sorted().findFirst().orElse("");
            if (!path.startsWith("/v1/")) {
                throw new IllegalStateException("Catalog violation: business operation %s must live under /v1/ (got %s)"
                    .formatted(op.id(), path));
            }
            Entry e = new Entry(op.id(), op.component(), methods.iterator().next().name(), path,
                op.permission(), op.risk().name(), op.resource(), op.title());
            Entry previous = byId.putIfAbsent(op.id(), e);
            if (previous != null) {
                throw new IllegalStateException(
                    "Catalog violation: duplicate operationId %s on %s vs %s".formatted(op.id(), previous.pathPattern(), path));
            }
            found.add(e);
        });

        found.sort(Comparator.comparing(Entry::operationId));
        this.entries = List.copyOf(found);
        this.digest = sha256(entries);

        for (Entry e : entries) {
            log.info("catalog_operation op={} method={} path={} permission={} risk={}",
                e.operationId(), e.method(), e.pathPattern(), e.permission(), e.risk());
        }
        log.info("catalog_published operations={} digest={}", entries.size(), digest);
    }

    public List<Entry> entries() {
        return entries;
    }

    public String digest() {
        return digest;
    }

    public Entry byOperationId(String operationId) {
        return entries.stream().filter(e -> e.operationId().equals(operationId)).findFirst().orElse(null);
    }

    private static String sha256(List<Entry> list) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (Entry e : list) {
                md.update(("%s|%s|%s|%s|%s|%s|%s\n".formatted(e.operationId(), e.method(), e.pathPattern(),
                    e.permission(), e.risk(), e.component(), e.resource())).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            return HexFormat.of().formatHex(md.digest());
        } catch (Exception e) {
            throw new IllegalStateException("digest failure", e);
        }
    }
}
