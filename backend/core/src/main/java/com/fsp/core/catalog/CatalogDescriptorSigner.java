package com.fsp.core.catalog;

import com.fsp.core.ui.UiSigner;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Signs the boot-generated operation catalog descriptor with the portal-builder key
 * (FAPI2 guide §3 signed publication; plans/signed-portal-delivery-plan.md §5, slice S4).
 * The JWS covers the FULL canonical descriptor (digest + every operation entry), so any
 * entry — permission rename, path change, deleted operation — breaks verification. CI and
 * the gateway-side hardening verify it with the same pinned trust store as the SPA uses
 * for portal bundles.
 *
 * ECDSA signatures are randomized per signing, so two signatures over identical content
 * differ; consumers verify cryptographically (UiSigner.verify), never by string compare.
 */
@Slf4j
@Component
public class CatalogDescriptorSigner {

    private final OperationCatalog catalog;
    private final UiSigner signer;

    public CatalogDescriptorSigner(OperationCatalog catalog, UiSigner signer) {
        this.catalog = catalog;
        this.signer = signer;
    }

    /** Canonical JSON of the descriptor — bit-stable input to digest + JWS. */
    private String canonicalDescriptor() {
        StringBuilder sb = new StringBuilder("{\"count\":").append(catalog.entries().size())
            .append(",\"digest\":\"").append(catalog.digest()).append("\",\"operations\":[" );
        boolean first = true;
        for (OperationCatalog.Entry e : catalog.entries()) {
            if (!first) sb.append(',');
            first = false;
            sb.append("{\"component\":\"").append(json(e.component()))
              .append("\",\"method\":\"").append(json(e.method()))
              .append("\",\"operationId\":\"").append(json(e.operationId()))
              .append("\",\"pathPattern\":\"").append(json(e.pathPattern()))
              .append("\",\"permission\":\"").append(json(e.permission()))
              .append("\",\"resource\":\"").append(json(e.resource()))
              .append("\",\"risk\":\"").append(json(e.risk()))
              .append("\",\"title\":\"").append(json(e.title()))
              .append("\"}");
        }
        return sb.append("]}").toString();
    }

    /** JWS over the canonical descriptor (canonicalization inside the signer keeps order stable). */
    public String jws() {
        return signer.sign(signer.canonicalize(canonicalDescriptor()));
    }

    public String kid() {
        return signer.kid();
    }

    /** Checkpoint seam: cryptographically verify the freshly-produced signature. */
    public boolean selfVerifies() {
        String canonical = signer.canonicalize(canonicalDescriptor());
        return signer.verify(canonical, jws());
    }

    private static String json(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
