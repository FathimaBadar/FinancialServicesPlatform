package com.fsp.core.ui;

import com.fsp.core.approval.ApprovalHandler;
import com.fsp.core.approval.ApprovalRequest;
import com.fsp.core.common.Actor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/** Publishes (or rejects) a portal layout when its {@code UI_LAYOUT_PUBLISH} approval resolves. */
@Slf4j
@Component
public class UiLayoutPublishHandler implements ApprovalHandler {

    private final UiLayoutRepository layouts;
    private final UiBundleService bundles;

    public UiLayoutPublishHandler(UiLayoutRepository layouts, UiBundleService bundles) {
        this.layouts = layouts;
        this.bundles = bundles;
    }

    @Override
    public String operationType() {
        return ApprovalRequest.OpType.UI_LAYOUT_PUBLISH;
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
        UiLayout live = layouts.findFirstByPortalAndStatus(draft.portal, UiLayout.Status.PUBLISHED)
            .orElseGet(() -> {
                UiLayout fresh = new UiLayout();
                fresh.id = UUID.randomUUID();
                fresh.portal = draft.portal;
                fresh.status = UiLayout.Status.PUBLISHED;
                fresh.createdAt = Instant.now();
                return fresh;
            });
        live.layoutJson = draft.layoutJson;
        live.schemaVersion = draft.schemaVersion;
        live.makerId = draft.makerId;
        live.publishedApprovalId = approval.id;
        live.updatedAt = Instant.now();
        layouts.save(live);
        // Sign-on-publish (plans/signed-portal-delivery-plan.md S1): the delivery bundle is
        // minted in the SAME transaction as the publish — approval and signature move together.
        bundles.generate(live.portal);
        log.info("ui_layout_published portal={} layoutId={} approvalId={} checker={}",
            live.portal, live.id, approval.id, checker.username());
    }
}
