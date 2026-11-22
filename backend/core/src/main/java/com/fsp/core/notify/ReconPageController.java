package com.fsp.core.notify;

import com.fsp.core.common.Actor;
import com.fsp.core.common.FspOperation;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Recon page dispatch (Stage 6, plan §11): the recon-worker (machine plane, read-only
 * otherwise) posts invariant violations here; pages become notification rows flowing
 * through the V29/V31 channel plane (email/SMS/push — §12.9). The recon worker never
 * writes to core's database directly — this machine-actor op is its only mutator.
 */
@RestController
@RequestMapping("/v1/recon")
public class ReconPageController {

    private final NotificationService notifications;

    public ReconPageController(NotificationService notifications) {
        this.notifications = notifications;
    }

    public record PageBody(String invariant, String severity, String detail) {}

    @PostMapping("/pages")
    @FspOperation(id = "recon.page", component = "platform", permission = "",
        risk = FspOperation.OperationRisk.WRITE, title = "Page on recon invariant violation",
        actors = {Actor.ActorType.MACHINE})
    public Map<String, Object> page(HttpServletRequest request, @RequestBody PageBody body) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        int recipients = notifications.reconPage(actor.activeTenantId(),
            body.invariant(), body.severity(), body.detail());
        return Map.of("recipients", recipients, "invariant", body.invariant(),
            "severity", body.severity());
    }
}
