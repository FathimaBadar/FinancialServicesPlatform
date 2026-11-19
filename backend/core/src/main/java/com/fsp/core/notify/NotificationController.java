package com.fsp.core.notify;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import com.fsp.core.config.FspProperties;
import com.fsp.core.rbac.PermissionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

/**
 * F-12 surface: the person's notification inbox + push-device registration. All operations
 * require {@code notification.view} (it governs reads AND device registration — a device is
 * a lens on your inbox). Person-plane identities only: {@code actor.personId()} is the home
 * person (never re-based by act-as), so a DELEGATED/MACHINE actor is refused.
 */
@RestController
@RequestMapping("/v1/notifications")
public class NotificationController {

    public record PushSubscribeRequest(String platform, String endpoint, String token,
                                       String p256dh, String auth, String userAgent) {}

    public record NotificationView(UUID id, String type, String opType, String title, String body,
                                   String link, boolean unread, String createdAt) {}

    public record PushSubscriptionView(UUID id, String platform, String status, String createdAt) {}

    private final NotificationService service;
    private final PermissionService permissions;
    private final FspProperties props;

    public NotificationController(NotificationService service, PermissionService permissions,
                                  FspProperties props) {
        this.service = service;
        this.permissions = permissions;
        this.props = props;
    }

    @FspOperation(id = "notification.list", permission = "notification.view", component = "notify",
        title = "Read the notification inbox")
    @GetMapping
    public ResponseEntity<Map<String, Object>> list(HttpServletRequest request) {
        Actor actor = actor(request);
        return ResponseEntity.ok(Map.of(
            "items", service.list(actor.personId()).stream().map(NotificationController::view).toList(),
            "unread", service.unreadCount(actor.personId())));
    }

    /** Cheap poll target for the badge (no rows over the wire). */
    @FspOperation(id = "notification.unread-count", permission = "notification.view", component = "notify",
        title = "Read the pending notification count")
    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Object>> unread(HttpServletRequest request) {
        Actor actor = actor(request);
        return ResponseEntity.ok(Map.of("unread", service.unreadCount(actor.personId())));
    }

    @FspOperation(id = "notification.read-all", permission = "notification.view", component = "notify",
        risk = FspOperation.OperationRisk.WRITE, title = "Mark all notifications read")
    @PostMapping("/read-all")
    public ResponseEntity<Void> markRead(HttpServletRequest request) {
        Actor actor = actor(request);
        service.markAllRead(actor.personId());
        return ResponseEntity.noContent().build();
    }

    /** Public VAPID key for the SPA service worker (only when the webpush channel is on). */
    @FspOperation(id = "notification.push.config", permission = "notification.view", component = "notify",
        title = "Read the push channel configuration")
    @GetMapping("/push/config")
    public ResponseEntity<Map<String, Object>> pushConfig(HttpServletRequest request) {
        actor(request);
        var wp = props.getPush();
        if (!wp.isWebpushEnabled()) {
            return ResponseEntity.ok(Map.of("webpushEnabled", false));
        }
        return ResponseEntity.ok(Map.of(
            "webpushEnabled", true,
            "vapidPublicKey", wp.getWebpushPublicKey()));
    }

    @FspOperation(id = "notification.push.subscribe", permission = "notification.view", component = "notify",
        risk = FspOperation.OperationRisk.WRITE, title = "Register a push device for your identity")
    @PostMapping("/push/subscriptions")
    public ResponseEntity<PushSubscriptionView> subscribe(@RequestBody PushSubscribeRequest body,
                                                          HttpServletRequest request) {
        Actor actor = actor(request);
        PushSubscription row = service.subscribe(
            actor.personId(), body.platform(), body.endpoint(), body.token(),
            body.p256dh(), body.auth(), body.userAgent());
        return ResponseEntity.ok(new PushSubscriptionView(row.id, row.platform, row.status,
            String.valueOf(row.createdAt)));
    }

    /** The browser forgot the device → retire the row (definitive). Endpoint is URL-encoded in the path. */
    @FspOperation(id = "notification.push.unsubscribe", permission = "notification.view", component = "notify",
        risk = FspOperation.OperationRisk.WRITE, title = "Retire a push device for your identity")
    @DeleteMapping("/push/subscriptions/{endpoint}")
    public ResponseEntity<Void> unsubscribe(@PathVariable String endpoint, HttpServletRequest request) {
        Actor actor = actor(request);
        service.unsubscribe(URLDecoder.decode(endpoint, StandardCharsets.UTF_8), actor.personId());
        return ResponseEntity.noContent().build();
    }

    private static NotificationView view(Notification n) {
        return new NotificationView(n.id, n.type, n.opType, n.title, n.body, n.link,
            n.readAt == null, String.valueOf(n.createdAt));
    }

    /** Person plane only + notification.view gate, scoped to the actor's active tenant. */
    private Actor actor(HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null || actor.type() != Actor.ActorType.PERSON) {
            throw ApiException.unauthorized("ACTOR_MISSING", "a person identity is required");
        }
        permissions.require(actor, "notification.view", actor.activeTenantId());
        return actor;
    }
}
