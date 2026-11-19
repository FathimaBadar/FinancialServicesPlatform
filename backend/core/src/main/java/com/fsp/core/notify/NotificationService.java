package com.fsp.core.notify;

import com.fsp.core.common.ApiException;
import com.fsp.core.common.RequestCorrelation;
import com.fsp.core.identity.Person;
import com.fsp.core.identity.PersonRepository;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.rbac.RbacRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * F-12 notification writer. A domain moment (approval opened) creates ONE durable pointer
 * per eligible person, then records {@code Notification.PushRequired} in the outbox — same
 * transaction, so a rollback never sends a push for a thing that never happened. The push
 * dispatcher independently scans {@code notifications.pushed_at IS NULL}; the outbox row is
 * the audit evidence of intent, the table is the delivery queue.
 *
 * Content contract (AGENTS §2c / FAPI data minimization): title/body are GENERIC words.
 * No maker names, no amounts, no account data — the type + link are enough to route.
 */
@Slf4j
@Service
public class NotificationService {

    public static final String TYPE_APPROVAL_OPEN = "APPROVAL_OPEN";

    private final NotificationRepository repository;
    private final PushSubscriptionRepository subscriptions;
    private final RbacRepository rbac;
    private final PersonRepository persons;
    private final OutboxService outbox;

    public NotificationService(NotificationRepository repository, PushSubscriptionRepository subscriptions,
                               RbacRepository rbac, PersonRepository persons, OutboxService outbox) {
        this.repository = repository;
        this.subscriptions = subscriptions;
        this.rbac = rbac;
        this.persons = persons;
        this.outbox = outbox;
    }

    // ---------- write side ----------

    /**
     * Point every ACTIVE person of {@code tenantId} holding {@code checkerPermission} at the
     * approval that just opened (maker excluded — four-eyes §3.1: you never approve your own).
     */
    @Transactional
    public void notifyCheckers(UUID tenantId, String opType, String checkerPermission,
                               UUID resourceId, UUID makerPersonId) {
        List<Person> holders = rbac.activePersonsWithPermission(tenantId, checkerPermission);
        List<UUID> notified = new ArrayList<>();
        for (Person p : holders) {
            if (p.id.equals(makerPersonId)) continue;
            if (repository.existsByPersonIdAndTypeAndResourceId(p.id, TYPE_APPROVAL_OPEN, resourceId)) continue;
            Notification n = new Notification();
            n.id = UUID.randomUUID();
            n.personId = p.id;
            n.tenantId = tenantId;
            n.type = TYPE_APPROVAL_OPEN;
            n.opType = opType;
            n.title = "Awaiting approval";
            n.body = "A " + opLabel(opType) + " is waiting for a checker decision.";
            n.resourceType = "ApprovalRequest";
            n.resourceId = resourceId;
            n.link = "/approvals";
            repository.save(n);
            notified.add(p.id);
        }
        if (!notified.isEmpty()) {
            outbox.record("Notification", resourceId, "Notification.PushRequired",
                "{\"opType\":\"%s\",\"resourceId\":\"%s\",\"personIds\":[%s],\"correlationId\":\"%s\"}"
                    .formatted(opType, resourceId,
                        notified.stream().map(id -> "\"" + id + "\"").reduce((a, b) -> a + "," + b).orElse(""),
                        RequestCorrelation.currentCorrelation() == null ? UUID.randomUUID() : RequestCorrelation.currentCorrelation()));
            log.info("notifications_queued type={} opType={} resourceId={} recipients={}",
                TYPE_APPROVAL_OPEN, opType, resourceId, notified.size());
        }
    }

    /** Self-service subscribe over BFF/session (person-plane only; act-as never re-bases devices). */
    @Transactional
    public PushSubscription subscribe(UUID personId, String platform, String endpoint, String token,
                                      String p256dh, String auth, String userAgent) {
        if (!List.of("WEBPUSH", "APNS", "FCM").contains(platform)) {
            throw ApiException.badRequest("PUSH_PLATFORM", "platform must be WEBPUSH, APNS or FCM");
        }
        // one identity per device: WEBPUSH by endpoint URL, APNs/FCM by token
        if (platform.equals("WEBPUSH")) {
            if (endpoint == null || !endpoint.startsWith("https://")) {
                throw ApiException.badRequest("PUSH_ENDPOINT", "WEBPUSH subscriptions need an https push-service endpoint");
            }
        } else if (token == null || token.isBlank()) {
            throw ApiException.badRequest("PUSH_TOKEN", platform + " subscriptions need a device token");
        }
        PushSubscription row = platform.equals("WEBPUSH")
            ? subscriptions.findByEndpointAndStatus(endpoint, "ACTIVE").orElse(null)
            : subscriptions.findByPlatformAndTokenAndStatus(platform, token, "ACTIVE").orElse(null);
        if (row != null) {
            // re-subscription of the same device: refresh key material, stay one row
            row.p256dh = p256dh; row.auth = auth; row.userAgent = userAgent;
            subscriptions.save(row);
            return row;
        }
        Person owner = persons.findById(personId)
            .orElseThrow(() -> ApiException.notFound("PERSON_NOT_FOUND", "person not found"));
        row = new PushSubscription();
        row.id = UUID.randomUUID();
        row.personId = personId;
        row.tenantId = owner.tenantId;
        row.platform = platform;
        row.endpoint = endpoint == null ? "" : endpoint;
        row.token = token == null ? "" : token;
        row.p256dh = p256dh;
        row.auth = auth;
        row.userAgent = userAgent;
        row.status = "ACTIVE";
        subscriptions.save(row);
        log.info("push_subscribed person={} platform={}", personId, platform);
        return row;
    }

    // ---------- read side ----------

    public List<Notification> list(UUID personId) {
        return repository.findByPersonIdOrderByCreatedAtDesc(personId);
    }

    public long unreadCount(UUID personId) {
        return repository.countUnread(personId);
    }

    @Transactional
    public void markAllRead(UUID personId) {
        repository.markAllRead(personId, java.time.Instant.now());
    }

    @Transactional
    public void unsubscribe(String endpoint, UUID personId) {
        subscriptions.findByEndpointAndStatus(endpoint, "ACTIVE").ifPresent(row -> {
            if (!row.personId.equals(personId)) {
                // another person's device: refuse without leaking existence
                throw ApiException.forbidden("PUSH_SUBSCRIPTION_OTHER", "not your device");
            }
            subscriptions.retire(row.id, java.time.Instant.now());
            log.info("push_unsubscribed person={} platform={}", personId, row.platform);
        });
    }

    private static String opLabel(String opType) {
        return switch (opType) {
            case "BANK_ACCOUNT_CREATE" -> "settlement bank account filing";
            case "JE_POSTING" -> "journal entry posting";
            case "KYC_TENANT_ACTIVATION" -> "tenant activation";
            case "USER_CREATE", "USER_UPDATE", "USER_DEACTIVATE", "USER_ACTIVATE", "USER_REMOVE" ->
                "user management change";
            case "ROLE_CREATE", "ROLE_UPDATE", "ROLE_DELETE" -> "role change";
            case "UI_LAYOUT_PUBLISH" -> "portal layout publish";
            case "PLUGIN_REGISTER", "PLUGIN_INSTALL" -> "plugin lifecycle change";
            default -> opType.toLowerCase().replace('_', ' ');
        };
    }
}
