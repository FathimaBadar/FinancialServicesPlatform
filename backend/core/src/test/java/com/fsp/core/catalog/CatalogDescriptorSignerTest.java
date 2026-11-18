package com.fsp.core.catalog;

import com.fsp.core.config.FspProperties;
import com.fsp.core.ui.UiSigner;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.security.MessageDigest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * plans/signed-portal-delivery-plan.md §5 (slice S4): the boot-generated operation catalog
 * is signed with the portal-builder key — the same trust pipeline as portal bundles.
 * Any catalog drift (permission rename, path change, deleted operation) breaks verification.
 */
class CatalogDescriptorSignerTest {

    @TempDir
    static Path dir;
    static UiSigner signer;
    static OperationCatalog catalog;

    @BeforeAll
    static void init() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = gen.generateKeyPair();
        Files.writeString(dir.resolve("catalog-signing.pem"),
                pem("PRIVATE KEY", pair.getPrivate().getEncoded()));
        Files.writeString(dir.resolve("catalog-signing-pub.pem"),
                pem("PUBLIC KEY", pair.getPublic().getEncoded()));
        FspProperties props = new FspProperties();
        props.getUi().setSigningKeyPath(dir.resolve("catalog-signing.pem").toString());
        props.getUi().setSigningKid("catalog-kid-1");
        signer = new UiSigner(props);
        catalog = new OperationCatalog(null);
        ReflectionTestUtils.setField(catalog, "entries", List.of(
            new OperationCatalog.Entry("ui.bundle.read", "core", "GET", "/v1/ui/bundles/{portal}",
                "ui.bundle.read", "MEDIUM", "UI_BUNDLE", "Read signed portal bundle"),
            new OperationCatalog.Entry("ui.widget.list", "core", "GET", "/v1/ui/widgets",
                "ui.widget.list", "LOW", "UI_WIDGET", "List widgets")));
        // digest over the same canonical line format OperationCatalog.sha256 uses
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (OperationCatalog.Entry e : catalog.entries()) {
            md.update(("%s|%s|%s|%s|%s|%s|%s\n".formatted(e.operationId(), e.method(), e.pathPattern(),
                e.permission(), e.risk(), e.component(), e.resource())).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        ReflectionTestUtils.setField(catalog, "digest", HexFormat.of().formatHex(md.digest()));
    }

    private static String pem(String type, byte[] der) {
        String b64 = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der);
        return "-----BEGIN " + type + "-----\n" + b64 + "\n-----END " + type + "-----\n";
    }

    /** Rebuild the descriptor canonical form the same way the signer does, independently. */
    private String descriptorJson(OperationCatalog c) {
        StringBuilder sb = new StringBuilder("{\"count\":").append(c.entries().size())
            .append(",\"digest\":\"").append(c.digest()).append("\",\"operations\":[");
        boolean first = true;
        for (OperationCatalog.Entry e : c.entries()) {
            if (!first) sb.append(',');
            first = false;
            sb.append("{\"component\":\"core\",\"method\":\"").append(e.method())
              .append("\",\"operationId\":\"").append(e.operationId())
              .append("\",\"pathPattern\":\"").append(e.pathPattern())
              .append("\",\"permission\":\"").append(e.permission())
              .append("\",\"resource\":\"").append(e.resource())
              .append("\",\"risk\":\"").append(e.risk())
              .append("\",\"title\":\"").append(e.title())
              .append("\"}");
        }
        return sb.append("]}").toString();
    }

    @Test
    void selfVerifies() {
        CatalogDescriptorSigner s = new CatalogDescriptorSigner(catalog, signer);
        assertThat(s.selfVerifies()).isTrue();
        assertThat(s.kid()).isEqualTo("catalog-kid-1");
    }

    @Test
    void jwsVerifiesOverTheDescriptorContentAndKidMatches() {
        CatalogDescriptorSigner s = new CatalogDescriptorSigner(catalog, signer);
        assertThat(signer.verify(signer.canonicalize(descriptorJson(catalog)), s.jws())).isTrue();
    }

    @Test
    void permissionRenameBreaksVerification() {
        CatalogDescriptorSigner s = new CatalogDescriptorSigner(catalog, signer);
        OperationCatalog drifted = new OperationCatalog(null);
        ReflectionTestUtils.setField(drifted, "entries", List.of(
            new OperationCatalog.Entry("ui.bundle.read", "core", "GET", "/v1/ui/bundles/{portal}",
                "ui.bundle.read.RENAMED", "MEDIUM", "UI_BUNDLE", "Read signed portal bundle"),
            new OperationCatalog.Entry("ui.widget.list", "core", "GET", "/v1/ui/widgets",
                "ui.widget.list", "LOW", "UI_WIDGET", "List widgets")));
        ReflectionTestUtils.setField(drifted, "digest", "0000000000000000000000000000000000000000000000000000000000000000");
        // same JWS, drifted catalogue content → must fail (canonical payload identity check)
        assertThat(signer.verify(signer.canonicalize(descriptorJson(drifted)), s.jws())).isFalse();
    }
}
