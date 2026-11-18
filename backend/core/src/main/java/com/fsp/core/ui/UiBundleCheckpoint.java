package com.fsp.core.ui;

import com.fsp.core.audit.AuditService;
import com.fsp.core.catalog.CatalogDescriptorSigner;
import com.fsp.core.common.RequestCorrelation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Audit checkpoint (FAPI2 guide §7; plans/signed-portal-delivery-plan.md §3.1, slice S4) —
 * the SERVER-SIDE tamper control. The SPA verifies client-side and never reports home
 * (a tampered client's word is worthless), so drift detection must run in core:
 *
 *  1. re-assemble each portal's canonical payload from the CURRENT persisted world;
 *     its digest must equal the signed bundle's digest — divergence means someone altered
 *     {@code ui_layouts} / {@code ui_widgets} without re-publishing (or edited the DB
 *     directly): UI_CHECKPOINT_DRIFT alarm.
 *  2. cryptographically re-verify the stored JWS against the stored payload — divergence
 *     means a stored {@code ui_bundles} row was tampered with: UI_CHECKPOINT_SIGFAIL.
 *  3. re-verify the boot-generated operation catalog signature — UI_CHECKPOINT_CATSIGFAIL.
 *
 * Every outcome appends AuditService evidence (correlation id, before/after hashes); the
 * verdict (ok/drift counts) is logged with one structured line. Failures NEVER touch the
 * bundle rows — evidence only; quarantine/rollback is human and four-eyes work.
 */
@Slf4j
@Component
public class UiBundleCheckpoint implements SmartInitializingSingleton {

    private final UiBundleRepository bundles;
    private final UiBundleService assembly;
    private final UiSigner signer;
    private final CatalogDescriptorSigner catalogSigner;
    private final AuditService audit;

    public UiBundleCheckpoint(UiBundleRepository bundles, UiBundleService assembly,
                              UiSigner signer, CatalogDescriptorSigner catalogSigner, AuditService audit) {
        this.bundles = bundles;
        this.assembly = assembly;
        this.signer = signer;
        this.catalogSigner = catalogSigner;
        this.audit = audit;
    }

    @Override
    public void afterSingletonsInstantiated() {
        // catalog + signer are live by now; the first checkpoint runs on schedule (or on demand)
        log.info("ui_checkpoint_armed cron=daily (fsp.ui.checkpointCron overrides the 03:00 default)");
    }

    /** Daily checkpoint (guide §7 cadence). Explicit spring expression for operator control. */
    @Scheduled(cron = "${fsp.ui.checkpointCron:0 0 3 * * *}")
    public void scheduledCheckpoint() {
        run();
    }

    /** The checkpoint itself — safe to invoke from tests, admin tooling and the schedule. */
    public void run() {
        int checked = 0;
        int drifted = 0;
        int sigFail = 0;
        for (UiBundle bundle : bundles.findAllByCurrentTrue()) {
            checked++;
            String assembled = assembly.canonicalPayloadFor(bundle.portal);
            String assembledDigest = assembled == null ? null : signer.digest(assembled);
            if (assembledDigest == null || !assembledDigest.equals(bundle.digest)) {
                drifted++;
                alarm("UI_CHECKPOINT_DRIFT", bundle, bundle.digest, assembledDigest,
                    "signed bundle digest no longer matches the world it was signed for"); // before/after
                continue;
            }
            if (!signer.verify(bundle.payload, bundle.jws)) {
                sigFail++;
                alarm("UI_CHECKPOINT_SIGFAIL", bundle, bundle.digest, bundle.digest,
                    "stored signature no longer validates against the stored payload");
            }
        }
        boolean catalogOk = catalogSigner.selfVerifies();
        if (!catalogOk) {
            log.error("ui_checkpoint_catsigfail reason=catalog_signature_invalid msg=\"operation catalog signature failed re-verification\"");
        }
        if (drifted == 0 && sigFail == 0 && catalogOk) {
            log.info("ui_checkpoint_ok portals={} checked={} catalog=ok", checked, checked);
        } else {
            log.error("ui_checkpoint_alarm portals={} checked={} drift={} sigFail={} catalogOk={}",
                checked, checked, drifted, sigFail, catalogOk);
        }
    }

    /** Append-only evidence for one divergent bundle. before/after = stored vs re-assembled digest. */
    private void alarm(String actionType, UiBundle bundle, String beforeDigest, String afterDigest, String detail) {
        String correlation = RequestCorrelation.currentCorrelation();
        if (correlation == null) correlation = UUID.randomUUID().toString();
        log.error("ui_checkpoint_incident action={} portal={} bundleId={} kid={} digest={} detail={} correlationId={}",
            actionType, bundle.portal, bundle.id, bundle.kid, beforeDigest, detail, correlation);
        audit.record(null, null, null, null, actionType, "UI_BUNDLE", bundle.id.toString(),
            beforeDigest, afterDigest,
            false);
    }
}
