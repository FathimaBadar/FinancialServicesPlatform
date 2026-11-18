package com.fsp.core.ui;

import com.fsp.core.audit.AuditService;
import com.fsp.core.catalog.CatalogDescriptorSigner;
import com.fsp.core.catalog.OperationCatalog;
import com.fsp.core.config.FspProperties;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentMatchers;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.security.MessageDigest;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * plans/signed-portal-delivery-plan.md §3.1 (slice S4): the SERVER-SIDE tamper control.
 * The checkpoint re-assembles the world and cross-verifies the stored, signed bundle —
 * drift between what was signed and what the DB now holds is an incident, evidenced in
 * the append-only audit chain (acceptance 7).
 */
class UiBundleCheckpointTest {

    @TempDir
    static Path dir;
    static UiSigner signer;

    static AuditService audit;
    static UiBundleService assembly;
    static UiBundleRepository bundles;
    static UiBundleCheckpoint checkpoint;

    UiBundle bundle;         // fresh per test — the checkpoint must never mutate what it inspects
    String originalPayload;  // the signed-bytes baseline (immutably captured before any tamper)

    @BeforeAll
    static void init() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = gen.generateKeyPair();
        Files.writeString(dir.resolve("cp-signing.pem"), pem("PRIVATE KEY", pair.getPrivate().getEncoded()));
        Files.writeString(dir.resolve("cp-signing-pub.pem"), pem("PUBLIC KEY", pair.getPublic().getEncoded()));
        FspProperties props = new FspProperties();
        props.getUi().setSigningKeyPath(dir.resolve("cp-signing.pem").toString());
        props.getUi().setSigningKid("cp-kid-1");
        signer = new UiSigner(props);

        OperationCatalog catalog = new OperationCatalog(null);
        ReflectionTestUtils.setField(catalog, "entries", List.<OperationCatalog.Entry>of());
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        ReflectionTestUtils.setField(catalog, "digest", HexFormat.of().formatHex(md.digest()));
        CatalogDescriptorSigner catalogSigner = new CatalogDescriptorSigner(catalog, signer);

        assembly = mock(UiBundleService.class);
        bundles = mock(UiBundleRepository.class);
        audit = mock(AuditService.class);
        checkpoint = new UiBundleCheckpoint(bundles, assembly, signer, catalogSigner, audit);
    }

    @BeforeEach
    void resetMocks() {
        reset(audit); // invocations must never leak between tests
    }

    @BeforeEach
    void freshBundle() {
        bundle = new UiBundle();
        bundle.id = UUID.randomUUID();
        bundle.portal = "admin";
        bundle.current = true;
        bundle.kid = signer.kid();
        bundle.alg = signer.alg();
        String payload = signer.canonicalize(
            "{\"layoutVersion\":\"11111111-1111-1111-1111-111111111111\",\"menus\":{\"menus\":[]},\"portal\":\"admin\","
          + "\"publishedAt\":\"2026-11-18T00:00:00Z\",\"schemaVersion\":1,\"widgets\":[]}");
        bundle.payload = payload;
        originalPayload = payload; // immutable capture — later tampering never changes this
        bundle.digest = signer.digest(payload);
        bundle.jws = signer.sign(payload);
    }

    private static String pem(String type, byte[] der) {
        String b64 = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der);
        return "-----BEGIN " + type + "-----\n" + b64 + "\n-----END " + type + "-----\n";
    }

    @Test
    void intactWorldIsSilentOk() {
        when(bundles.findAllByCurrentTrue()).thenReturn(List.of(bundle));
        when(assembly.canonicalPayloadFor("admin")).thenReturn(originalPayload);
        checkpoint.run(); // must not throw, and must NOT raise an incident
        verify(audit, times(0)).record(any(), any(), any(), any(), ArgumentMatchers.startsWith("UI_CHECKPOINT"),
            anyString(), anyString(), anyString(), anyString(), anyBoolean());
    }

    @Test
    void worldDriftWithoutRepublishRaisesIncident() {
        when(bundles.findAllByCurrentTrue()).thenReturn(List.of(bundle));
        // an extra widget was registered after signing; nobody re-signed the bundle
        when(assembly.canonicalPayloadFor("admin"))
            .thenReturn(originalPayload.replace("\"widgets\":[]", "\"widgets\":[{\"id\":\"x\"}]"));
        checkpoint.run();
        verify(audit, times(1)).record(isNull(), isNull(), isNull(), isNull(),
            eq("UI_CHECKPOINT_DRIFT"), eq("UI_BUNDLE"), eq(bundle.id.toString()),
            eq(bundle.digest), anyString(), eq(false));
    }

    @Test
    void tamperedBundleRowRaisesSigfailIncident() {
        when(bundles.findAllByCurrentTrue()).thenReturn(List.of(bundle));
        when(assembly.canonicalPayloadFor("admin")).thenReturn(originalPayload); // world intact
        // the STORED row was edited directly: payload changed, signature row untouched
        bundle.payload = originalPayload.replace("\"menus\":[]", "\"menus\":[{\"id\":\"rogue\"}]");
        checkpoint.run();
        verify(audit, times(1)).record(isNull(), isNull(), isNull(), isNull(),
            eq("UI_CHECKPOINT_SIGFAIL"), eq("UI_BUNDLE"), eq(bundle.id.toString()),
            anyString(), anyString(), eq(false));
    }

    @Test
    void noPublishedLayoutCountsAsDrift() {
        when(bundles.findAllByCurrentTrue()).thenReturn(List.of(bundle));
        when(assembly.canonicalPayloadFor("admin")).thenReturn(null);
        checkpoint.run();
        verify(audit, times(1)).record(isNull(), isNull(), isNull(), isNull(),
            eq("UI_CHECKPOINT_DRIFT"), eq("UI_BUNDLE"), eq(bundle.id.toString()),
            anyString(), isNull(), eq(false));
    }
}
