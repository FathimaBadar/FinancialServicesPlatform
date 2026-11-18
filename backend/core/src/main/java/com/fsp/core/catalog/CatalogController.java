package com.fsp.core.catalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Signed-descriptor publishing seam (FAPI2 guide §3.3): /internal is credential-gated by
 * ActorContextFilter. The gateway/BFF route policy is derived from THIS descriptor —
 * never hand-maintained (guide §6: "explicit route set generated from approved descriptors").
 *
 * The descriptor carries a portal-builder-key ES256 JWS over its full canonical form
 * (plans/signed-portal-delivery-plan.md §5): consumers verify the signature against the
 * build-pinned trust store — the SAME trust pipeline as portal delivery bundles.
 */
@RestController
public class CatalogController {

    private final OperationCatalog catalog;
    private final CatalogDescriptorSigner signer;

    public CatalogController(OperationCatalog catalog, CatalogDescriptorSigner signer) {
        this.catalog = catalog;
        this.signer = signer;
    }

    @GetMapping("/internal/ops/catalog")
    public Map<String, Object> descriptor() {
        List<OperationCatalog.Entry> entries = catalog.entries();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("digest", catalog.digest());
        out.put("count", entries.size());
        out.put("kid", signer.kid());
        out.put("jws", signer.jws());
        out.put("operations", entries);
        return out;
    }
}
