package com.fsp.core.ui;

import com.fsp.core.config.FspProperties;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Signed-portal-delivery-plan S1: canonicalization, signing roundtrip, tamper evidence. */
class UiSignerTest {

    @TempDir
    static Path dir;
    static UiSigner signer;
    static ECPublicKey publicKey;

    @BeforeAll
    static void initSigner() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = gen.generateKeyPair();
        publicKey = (ECPublicKey) pair.getPublic();
        Files.writeString(dir.resolve("test-signing.pem"), pem("PRIVATE KEY", pair.getPrivate().getEncoded()));
        Files.writeString(dir.resolve("test-signing-pub.pem"), pem("PUBLIC KEY", pair.getPublic().getEncoded()));
        signKey();
    }

    private static void signKey() throws Exception {
        FspProperties props = new FspProperties();
        props.getUi().setSigningKeyPath(dir.resolve("test-signing.pem").toString());
        props.getUi().setSigningKid("test-kid-1");
        signer = new UiSigner(props); // resolveKeyPath: direct path exists → used as-is
    }

    private static String pem(String type, byte[] der) {
        String b64 = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der);
        return "-----BEGIN " + type + "-----\n" + b64 + "\n-----END " + type + "-----\n";
    }

    @Test
    void canonicalizationIsOrderInsensitiveAndWhitespaceFree() {
        String unordered = """
            {"b":1,  "a":{"y":2,"x":[1,2]},"c":3}""".stripIndent();
        String canonical = signer.canonicalize(unordered);
        String canonicalOfReordered = signer.canonicalize("""
            {"c":3,"a":{"x":[1,2],"y":2},"b":1}""");
        assertThat(canonical).doesNotContain(" ").isEqualTo(canonicalOfReordered);
        assertThat(canonical.indexOf("\"a\"")).isLessThan(canonical.indexOf("\"b\""));
    }

    @Test
    void digestIsStableSha256Hex() {
        String d1 = signer.digest("{\"a\":1}");
        String d2 = signer.digest(signer.canonicalize(" { \"a\": 1 } "));
        assertThat(d1).startsWith("sha256:").hasSize("sha256:".length() + 64).isEqualTo(d2);
    }

    @Test
    void jwsRoundtripVerifyWithPublicKey() throws Exception {
        String canonical = signer.canonicalize("{\"portal\":\"admin\",\"widgets\":[]}");
        String jws = signer.sign(canonical);
        String[] parts = jws.split("\\.");
        assertThat(jws.split("\\.")).hasSize(3);
        assertThat(new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8))
                .isEqualTo("{\"alg\":\"ES256\",\"kid\":\"test-kid-1\"}");
        // ES256 verify over the JCA-canonical (raw r||s) signature — WebCrypto-equivalent input
        Signature verify = Signature.getInstance("SHA256withECDSAinP1363Format");
        verify.initVerify(publicKey);
        verify.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(verify.verify(Base64.getUrlDecoder().decode(parts[2]))).isTrue();
    }

    @Test
    void tamperedPayloadChangesDigest() {
        String a = signer.digest("{\"portal\":\"admin\",\"menus\":[]}");
        String b = signer.digest("{\"portal\":\"admin\",\"menus\":[1]}");
        String c = signer.digest("{\"portal\":\"admin\",\"menu\":[]}"); // key rename = tamper
        assertThat(a).isNotEqualTo(b).isNotEqualTo(c);
    }

    @Test
    void jwsConvertsDerSignatureToRaw64Bytes() {
        byte[] der = buildDer(BigInteger.valueOf(5), BigInteger.valueOf(7));
        byte[] raw = UiSigner.jwsRaw(der);
        assertThat(raw).hasSize(64);
        assertThat(raw[31]).isEqualTo((byte) 5);
        assertThat(raw[63]).isEqualTo((byte) 7);
        // leading-zero stripped and left-padded correctly
        byte[] derPadded = buildDer(new BigInteger("0f".repeat(32), 16), BigInteger.valueOf(9));
        byte[] rawPadded = UiSigner.jwsRaw(derPadded);
        assertThat(rawPadded[0]).isEqualTo((byte) 0x0f);
        assertThat(rawPadded[63]).isEqualTo((byte) 9);
    }

    @Test
    void malformedCanonicalInputIsRejected() {
        assertThatThrownBy(() -> signer.canonicalize("{nope"))
                .hasMessageContaining("uicanon_bad_json");
    }

    @Test
    void jwkExposesPublicMaterialOnly() {
        UiDtos.TrustStoreView jwk = signer.jwk();
        assertThat(jwk.kid()).isEqualTo("test-kid-1");
        assertThat(jwk.alg()).isEqualTo("ES256");
        assertThat(jwk.kty()).isEqualTo("EC");
        assertThat(jwk.crv()).isEqualTo("P-256");
        assertThat(jwk.x()).hasSize(43); // base64url unpadded 32 bytes
        assertThat(jwk.y()).hasSize(43);
        // roundtrip: JWK coords match the actual public point
        Base64.Decoder dec = Base64.getUrlDecoder();
        BigInteger x = new BigInteger(1, dec.decode(jwk.x()));
        BigInteger y = new BigInteger(1, dec.decode(jwk.y()));
        assertThat(x).isEqualTo(publicKey.getW().getAffineX());
        assertThat(y).isEqualTo(publicKey.getW().getAffineY());
    }

    private static byte[] buildDer(BigInteger r, BigInteger s) {
        byte[] rB = truncate(r.toByteArray());
        byte[] sB = truncate(s.toByteArray());
        int content = 2 + rB.length + 2 + sB.length;   // two INTEGER TLVs
        byte[] out = new byte[2 + content];
        out[0] = 0x30;
        out[1] = (byte) content;
        out[2] = 0x02;
        out[3] = (byte) rB.length;
        System.arraycopy(rB, 0, out, 4, rB.length);
        int o = 4 + rB.length;
        out[o] = 0x02;
        out[o + 1] = (byte) sB.length;
        System.arraycopy(sB, 0, out, o + 2, sB.length);
        return out;
    }

    private static byte[] truncate(byte[] v) {
        int i = 0;
        while (i < v.length - 1 && v[i] == 0) i++;
        byte[] t = new byte[v.length - i];
        System.arraycopy(v, i, t, 0, t.length);
        return t;
    }

    // ------------------------------------------------------- verify (S4 checkpoint)

    @Test
    void verifyAcceptsOwnSignature() {
        String canonical = signer.canonicalize("{\"portal\":\"admin\",\"menus\":[]}");
        assertThat(signer.verify(canonical, signer.sign(canonical))).isTrue();
    }

    @Test
    void verifyRefusesTamperedPayload() {
        String canonical = signer.canonicalize("{\"portal\":\"admin\",\"menus\":[]}");
        String jws = signer.sign(canonical);
        String other = signer.canonicalize("{\"portal\":\"admin\",\"menus\":[{\"id\":\"xss\"}]}");
        assertThat(signer.verify(other, jws)).isFalse();
    }

    @Test
    void verifyRefusesWrongKidAndMalformedJws() {
        String canonical = signer.canonicalize("{\"portal\":\"admin\",\"menus\":[]}");
        String jws = signer.sign(canonical);
        String wrongKid = jws.replaceFirst(
            "^" + java.util.regex.Pattern.quote(java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString("{\"alg\":\"ES256\",\"kid\":\"test-kid-1\"}".getBytes(StandardCharsets.UTF_8))),
            java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString("{\"alg\":\"ES256\",\"kid\":\"other-kid\"}".getBytes(StandardCharsets.UTF_8)));
        assertThat(signer.verify(canonical, wrongKid)).isFalse();
        assertThat(signer.verify(canonical, "not-a-jws")).isFalse();
        assertThat(signer.verify(canonical, "a.b")).isFalse();
    }

    @Test
    void jwsDerRoundtripsRaw64() {
        // raw → DER → raw must be the identity on padded 64-byte input (checkpoint re-verification path)
        byte[] raw = new byte[64];
        byte[] r = signer.pad32(new BigInteger("08765432109876543210987654321098765432101", 16).toByteArray()); // leading zero
        byte[] s = signer.pad32(new BigInteger("ff239a7b5c6d2e1f0000000000000000000000000000000000000000000000aa", 16).toByteArray());
        System.arraycopy(r, 0, raw, 0, 32);
        System.arraycopy(s, 0, raw, 32, 32);
        byte[] back = UiSigner.jwsRaw(UiSigner.jwsDer(raw));
        assertThat(back).isEqualTo(raw);
    }
}
