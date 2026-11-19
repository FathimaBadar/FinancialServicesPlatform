package com.fsp.core.ui;

import com.fsp.core.approval.ApprovalHandler;
import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.common.Actor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Publishes (or rejects) a portal layout when its {@code UI_LAYOUT_PUBLISH} approval resolves.
 *
 * <p>Maker-checker integrity: the checker decides on the SUBMITTED snapshot
 * ({@code approval.payload}, taken by {@code PortalLayoutService.submit}); this handler
 * publishes that snapshot — never the current draft row, which a four-eyes-compliant flow
 * cannot mutate while the approval is pending anyway (draft is locked). Publishing is
 * DB-only (layout row + signed bundle), so it is {@link #atomicWithResolution() atomic
 * with the approval resolution}: a bundle failure rolls the decision back instead of
 * stranding an APPROVED-but-unpublished layout.</p>
 */
@Slf4j
@Component
public class UiLayoutPublishHandler implements ApprovalHandler {

    private final UiLayoutRepository layouts;
    private final UiBundleService bundles;
    private final LayoutValidator validator;

    public UiLayoutPublishHandler(UiLayoutRepository layouts, UiBundleService bundles,
                                  LayoutValidator validator) {
        this.layouts = layouts;
        this.bundles = bundles;
        this.validator = validator;
    }

    @Override
    public String operationType() {
        return ApprovalRequest.OpType.UI_LAYOUT_PUBLISH;
    }

    /** DB-only effect (layout row + signed bundle) — must commit or roll back WITH the approval row. */
    @Override
    public boolean atomicWithResolution() {
        return true;
    }

    @Override
    @Transactional
    public void apply(ApprovalRequest approval, boolean approved, Actor checker, String reason) {
        UiLayout draft = layouts.findById(approval.targetResourceId).orElse(null);
        if (draft == null) {
            log.error("ui_layout_publish_missing_layout approvalId={} target={}",
                approval.id, approval.targetResourceId);
            return;
        }
        if (!approved) {
            log.warn("ui_layout_publish_rejected portal={} layoutId={} checker={}",
                draft.portal, draft.id, checker.username());
            return;
        }
        // Publish exactly what the checker approved: the submit-time snapshot, re-validated
        // (defense in depth — the snapshot was validated at draft save, but a stale/corrupt
        // payload must be refused here, not persisted into the live row).
        if (approval.payload == null || approval.payload.isBlank()) {
            // Should not happen for UI_LAYOUT_PUBLISH (submit always snapshots the layout);
            // refuse to publish blind rather than falling back to unreviewed draft state.
            log.error("ui_layout_publish_no_payload approvalId={} layoutId={}",
                approval.id, draft.id);
            throw new IllegalStateException(
                "UI_LAYOUT_PUBLISH approval without a submitted layout snapshot: " + approval.id);
        }
        String approvedJson = validator.validate(approval.payload);
        UiLayout live = layouts.findFirstByPortalAndStatus(draft.portal, UiLayout.Status.PUBLISHED)
            .orElseGet(() -> {
                UiLayout fresh = new UiLayout();
                fresh.id = UUID.randomUUID();
                fresh.portal = draft.portal;
                fresh.status = UiLayout.Status.PUBLISHED;
                fresh.createdAt = Instant.now();
                return fresh;
            });
        live.layoutJson = approvedJson;
        live.schemaVersion = draft.schemaVersion;
        live.makerId = draft.makerId;
        live.publishedApprovalId = approval.id;
        live.updatedAt = Instant.now();
        layouts.save(live);
        // Sign-on-publish (plans/signed-portal-delivery-plan.md S1): the delivery bundle is
        // minted in the SAME transaction as the publish — and, with atomicWithResolution
        // above, in the same transaction as the approval decision itself.
        bundles.generate(live.portal);
        log.info("ui_layout_published portal={} layoutId={} approvalId={} checker={}",
            live.portal, live.id, approval.id, checker.username());
    }
}
