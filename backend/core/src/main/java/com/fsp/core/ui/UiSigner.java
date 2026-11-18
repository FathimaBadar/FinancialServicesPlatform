package com.fsp.core.ui;

import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fsp.core.config.FspProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECPoint;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

/**
 * Signs portal delivery bundles with the portal-builder keypair
 * (plans/signed-portal-delivery-plan.md S1). ES256 JWS (ECDSA P-256) over the SHA-256 digest
 * of the canonical payload (sorted keys, no whitespace) — the same canonical-hash discipline
 * as OperationCatalog (FAPI2 guide §3).
 *
 * The private key is mounted (AGENTS.md §7), never shipped, never logged. Only public JWK
 * material is exposed via {@link #jwk()} for the trust-store endpoint; the browser verifier's
 * real trust anchor is the JWKS pinned into the SPA at build time (slice S2).
 */
@Component
public class UiSigner {

    private static final Base64.Encoder B64URL = Base64.getUrlEncoder().withoutPadding();

    /** Own mapper: signing canonicalization must never depend on the ambient ObjectMapper's config. */
    private static final ObjectMapper CANONICAL = new ObjectMapper()
            .enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);

    private final FspProperties.Ui props;
    private final PrivateKey privateKey;
    private final java.security.PublicKey publicKey;
    private final ECPoint publicPoint;

    public UiSigner(FspProperties props) throws Exception {
        this.props = props.getUi();
        this.privateKey = KeyFactory.getInstance("EC")
                .generatePrivate(new PKCS8EncodedKeySpec(decodePem(resolveKeyPath(this.props.getSigningKeyPath()))));
        ECPublicKey pub = (ECPublicKey) KeyFactory.getInstance("EC")
                .generatePublic(new X509EncodedKeySpec(decodePem(resolvePublicPath(this.props.getSigningKeyPath()))));
        this.publicKey = pub;
        this.publicPoint = pub.getW();
    }

    /** Launcher-cwd-independent key lookup, mirroring the IdP resolver pattern.
     *  bootRun runs from backend/core → try configured, repo-relative (both depths), absolute. */
    private static final List<String> KEY_ROOTS = List.of(
            "infrastructure/pki/dev/",
            "../infrastructure/pki/dev/",
            "/home/arun/FinancialServicesPlatform/infrastructure/pki/dev/");

    private static Path resolveKeyPath(String configured) {
        Path p = Path.of(configured);
        if (Files.exists(p)) return p;
        return KEY_ROOTS.stream().map(r -> Path.of(r, "ui-builder-signing.pem"))
                .filter(Files::exists).findFirst()
                .orElse(Path.of("infrastructure/pki/dev/ui-builder-signing.pem"));
    }

    /** Public key lives next to the private key: <base>-pub.pem. */
    private static Path resolvePublicPath(String configuredPrivateKeyPath) {
        Path p = Path.of(configuredPrivateKeyPath);
        if (Files.exists(p)) {
            Path pub = Path.of(p.toString().replace(".pem", "-pub.pem"));
            if (Files.exists(pub)) return pub;
        }
        return KEY_ROOTS.stream().map(r -> Path.of(r, "ui-builder-signing-pub.pem"))
                .filter(Files::exists).findFirst()
                .orElseThrow(() -> new IllegalStateException("ui_signing_pubkey_missing run 'make pki'"));
    }

    private static byte[] decodePem(Path file) throws IOException {
        String text = Files.readString(file).trim();
        if (text.startsWith("-----BEGIN")) {
            text = text.replaceAll("-----BEGIN [A-Z ]+-----", "")
                    .replaceAll("-----END [A-Z ]+-----", "")
                    .replaceAll("\\s", "");
            return Base64.getDecoder().decode(text);
        }
        return Files.readAllBytes(file);
    }

    // -------------------------------------------------------------- public API

    /** Canonical JSON: sorted keys, no whitespace — bit-stable JVM↔browser. */
    public String canonicalize(String json) {
        try {
            Object tree = CANONICAL.readValue(json, Object.class);
            return CANONICAL.writeValueAsString(tree);
        } catch (IOException e) {
            throw new UncheckedIOException("uicanon_bad_json: " + e.getMessage(), e);
        }
    }

    public String digest(String canonicalJson) {
        try {
            return "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonicalJson.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("uidigest_failed", e);
        }
    }

    /** ES256 compact JWS. The signing input covers the canonical payload bytes verbatim. */
    public String sign(String canonicalJson) {
        try {
            String header = "{\"alg\":\"ES256\",\"kid\":\"" + props.getSigningKid() + "\"}";
            String signingInput = B64URL.encodeToString(header.getBytes(StandardCharsets.UTF_8))
                    + "." + B64URL.encodeToString(canonicalJson.getBytes(StandardCharsets.UTF_8));
            Signature sig = Signature.getInstance("SHA256withECDSA");
            sig.initSign(privateKey);
            sig.update(signingInput.getBytes(StandardCharsets.US_ASCII));
            return signingInput + "." + B64URL.encodeToString(jwsRaw(sig.sign()));
        } catch (Exception e) {
            throw new IllegalStateException("uisign_failed", e);
        }
    }
    /**
     * Cryptographic verification of a compact JWS produced by {@link #sign(String)} — the
     * checkpoint job (plans/signed-portal-delivery-plan.md S4) uses this to prove stored
     * artifacts still validate byte-for-byte. Fail-closed: header checks + P-256 verify.
     */
    public boolean verify(String canonicalJson, String jws) {
        try {
            String[] parts = jws.split("\\.");
            if (parts.length != 3) return false;
            var header = CANONICAL.readTree(Base64.getUrlDecoder().decode(parts[0]));
            if (!"ES256".equals(header.path("alg").asText(""))) return false;
            if (!props.getSigningKid().equals(header.path("kid").asText(""))) return false;
            // the verified payload must BE the JWS body — an edited payload with the original
            // signature must fail even though the old signature still validates cryptographically
            if (!java.security.MessageDigest.isEqual(
                    canonicalJson.getBytes(StandardCharsets.UTF_8),
                    Base64.getUrlDecoder().decode(parts[1]))) {
                return false;
            }
            byte[] signingInput = (parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII);
            byte[] der = jwsDer(Base64.getUrlDecoder().decode(parts[2]));
            Signature sig = Signature.getInstance("SHA256withECDSA");
            sig.initVerify(publicKey);
            sig.update(signingInput);
            return sig.verify(der);
        } catch (Exception e) {
            return false;
        }
    }

    /** Public JWK (x/y) for GET /v1/ui/trust-store — PUBLIC material only. */
    public UiDtos.TrustStoreView jwk() {
        return new UiDtos.TrustStoreView(props.getSigningKid(), props.getAlg(), "EC", "P-256",
                B64URL.encodeToString(leftPadded32(publicPoint.getAffineX())),
                B64URL.encodeToString(leftPadded32(publicPoint.getAffineY())));
    }

    public String kid() { return props.getSigningKid(); }
    public String alg() { return props.getAlg(); }

    // -------------------------------------------------------------- helpers

    /** Inverse of raw conversion: raw r||s (64 bytes on P-256) → DER ECDSA-Sig-Value. */
    static byte[] jwsDer(byte[] raw) {
        byte[] r = trimLeadingZero(raw, 0, 32);
        byte[] s = trimLeadingZero(raw, 32, 32);
        byte[] derR = derInteger(r);
        byte[] derS = derInteger(s);
        byte[] seq = new byte[2 + derR.length + derS.length];
        seq[0] = 0x30;
        seq[1] = (byte) (derR.length + derS.length);
        System.arraycopy(derR, 0, seq, 2, derR.length);
        System.arraycopy(derS, 0, seq, 2 + derR.length, derS.length);
        return seq;
    }

    private static byte[] trimLeadingZero(byte[] src, int off, int len) {
        int i = off;
        while (i < off + len - 1 && src[i] == 0) i++;
        return Arrays.copyOfRange(src, i, off + len);
    }

    private static byte[] derInteger(byte[] v) {
        int i = 0;
        while (i < v.length - 1 && v[i] == 0) i++;   // strip leading zeros
        byte[] mag = Arrays.copyOfRange(v, i, v.length);
        boolean pad = (mag[0] & 0x80) != 0;
        byte[] out = new byte[2 + mag.length + (pad ? 1 : 0)];
        out[0] = 0x02;
        out[1] = (byte) (mag.length + (pad ? 1 : 0));
        if (pad) out[2] = 0x00;
        System.arraycopy(mag, 0, out, out.length - mag.length, mag.length);
        return out;
    }

    /** JCA emits DER-encoded ECDSA; JWS ES256 requires raw r||s (32 bytes each on P-256). */
    static byte[] jwsRaw(byte[] der) {
        if (der.length < 2 || der[0] != 0x30) throw new IllegalArgumentException("uisig_not_der");
        int pos = 2;
        int seqLen = der[1] & 0xff;
        if ((seqLen & 0x80) != 0) pos = 2 + (seqLen & 0x7f);
        byte[] r = readInteger(der, pos);
        byte[] s = readInteger(der, pos + r.length + 2);
        byte[] out = new byte[64];
        byte[] rPad = pad32(r);
        byte[] sPad = pad32(s);
        System.arraycopy(rPad, 0, out, 0, 32);
        System.arraycopy(sPad, 0, out, 32, 32);
        return out;
    }

    private static byte[] readInteger(byte[] der, int off) {
        if (off >= der.length || der[off] != 0x02) throw new IllegalArgumentException("uisig_bad_integer");
        int len = der[off + 1] & 0xff;
        return Arrays.copyOfRange(der, off + 2, off + 2 + len);
    }

    static byte[] pad32(byte[] v) {
        int i = 0;
        while (i < v.length - 1 && v[i] == 0) i++;           // strip DER sign byte
        byte[] trim = Arrays.copyOfRange(v, i, v.length);
        byte[] out = new byte[32];
        int copyLen = Math.min(trim.length, 32);
        System.arraycopy(trim, trim.length - copyLen, out, 32 - copyLen, copyLen);
        return out;
    }

    static byte[] leftPadded32(BigInteger v) {
        return pad32(v.toByteArray());
    }
}
