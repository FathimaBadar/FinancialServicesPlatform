package com.fsp.core.notify;

import com.fsp.core.common.ApiException;
import com.fsp.core.common.RequestCorrelation;
import com.fsp.core.identity.Person;
import com.fsp.core.identity.PersonRepository;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.rbac.RbacRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
    private final NotificationChannelPrefRepository channelPrefs;
    private final PersonRepository persons;
    private final RbacRepository rbac;
    private final OutboxService outbox;

    public NotificationService(NotificationRepository repository, PushSubscriptionRepository subscriptions,
                               NotificationChannelPrefRepository channelPrefs, PersonRepository persons,
                               RbacRepository rbac, OutboxService outbox) {
        this.repository = repository;
        this.subscriptions = subscriptions;
        this.channelPrefs = channelPrefs;
        this.persons = persons;
        this.rbac = rbac;
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

    /** Inbox page record (§2f-compliant shape). */
    public record NotificationPage(List<NotificationView> items, int page, int size,
                                   long totalElements, int totalPages, boolean hasNext, long unread) {}

    public record NotificationView(UUID id, String type, String opType, String title, String body,
                                   String link, boolean unread, String createdAt) {}

    /** Sort safelist: wire field → entity property; anything else is refused (§2f). */
    private static final Map<String, String> SORT_FIELDS = Map.of(
        "createdAt", "createdAt", "readAt", "readAt", "type", "type", "opType", "opType");

    static Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by("id")); // newest first, stable tie-break
        }
        String[] parts = sort.split(",", -1);
        String field = SORT_FIELDS.get(parts[0].trim());
        String dir = parts.length > 1 ? parts[1].trim().toLowerCase(java.util.Locale.ROOT) : "desc";
        if (field == null || parts.length > 2 || !(dir.equals("asc") || dir.equals("desc"))) {
            throw ApiException.badRequest("SORT_INVALID",
                "Sort must be one of " + String.join(", ", SORT_FIELDS.keySet().stream().sorted().toList())
                    + " followed by ,asc or ,desc");
        }
        Sort primary = Sort.by(dir.equals("desc") ? Sort.Direction.DESC : Sort.Direction.ASC, field);
        // unique tie-break so rows never repeat or vanish between pages
        return primary.and(Sort.by(Sort.Direction.DESC, "createdAt")).and(Sort.by("id"));
    }

    /** Case-insensitive contains-pattern with LIKE wildcards escaped. */
    static String likePattern(String q) {
        if (q == null || q.isBlank()) return null;
        String t = q.trim().toLowerCase(java.util.Locale.ROOT);
        if (t.length() > 100) t = t.substring(0, 100);
        return "%" + t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    /** Server-side filters only — the person scope is FIXED to the actor (never from the wire). */
    static org.springframework.data.jpa.domain.Specification<Notification> inboxSpec(
            UUID personId, String like, Boolean unread) {
        return (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> where = new ArrayList<>();
            where.add(cb.equal(root.get("personId"), personId));
            if (like != null) {
                where.add(cb.or(
                    cb.like(cb.lower(root.<String>get("title")), like, '\\'),
                    cb.like(cb.lower(root.<String>get("body")), like, '\\'),
                    cb.like(cb.lower(root.<String>get("opType")), like, '\\')));
            }
            if (unread != null) {
                where.add(unread ? cb.isNull(root.get("readAt")) : cb.isNotNull(root.get("readAt")));
            }
            return cb.and(where.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    public NotificationPage listPage(UUID personId, Integer page, Integer size,
                                     String q, Boolean unread, String sort, long unreadCount) {
        int pageNum = page == null || page < 0 ? 0 : page;
        int pageSize = size == null || size < 1 ? 20 : Math.min(size, 100);
        String like = likePattern(q);
        var rows = repository.findAll(inboxSpec(personId, like, unread),
            PageRequest.of(pageNum, pageSize, parseSort(sort)));
        List<NotificationView> items = rows.getContent().stream()
            .map(n -> new NotificationView(n.id, n.type, n.opType, n.title, n.body, n.link,
                n.readAt == null, String.valueOf(n.createdAt)))
            .toList();
        return new NotificationPage(items, pageNum, pageSize, rows.getTotalElements(),
            rows.getTotalPages(), rows.hasNext(), unreadCount);
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

    // ---------- outbound channel consent (V29 — email/SMS) ----------

    /** One row per channel with content, or consent record otherwise. Self-service only:
     *  the caller passes the actor's home person id (never act-as writable). */
    public record ChannelState(String channel, boolean enabled, boolean dead, boolean hasContact) {}

    public List<ChannelState> channelState(UUID personId) {
        Person person = persons.findById(personId)
            .orElseThrow(() -> ApiException.notFound("PERSON_NOT_FOUND", "person not found"));
        return List.of(state(personId, NotificationChannelPref.EMAIL, notBlank(person.email)),
                       state(personId, NotificationChannelPref.SMS, notBlank(person.phone)));
    }

    /** Toggle one or both channels. Enabling requires a profile contact on that channel
     *  (consent without a target is meaningless) and clears a bounce-verdict dead flag —
     *  the person asserts they fixed the profile contact. Disabling always succeeds. */
    @Transactional
    public List<ChannelState> setChannels(UUID personId, Boolean email, Boolean sms) {
        if (email != null) toggle(personId, NotificationChannelPref.EMAIL, email);
        if (sms != null) toggle(personId, NotificationChannelPref.SMS, sms);
        return channelState(personId);
    }

    private void toggle(UUID personId, String channel, boolean enable) {
        if (!List.of(NotificationChannelPref.EMAIL, NotificationChannelPref.SMS).contains(channel)) {
            throw ApiException.badRequest("CHANNEL_UNKNOWN", "channel must be EMAIL or SMS");
        }
        NotificationChannelPref row = channelPrefs.findByPersonIdAndChannel(personId, channel).orElse(null);
        if (row == null) {
            if (!enable) return; // disabling an absent consent: already off, idempotent
            row = new NotificationChannelPref();
            row.personId = personId;
            row.channel = channel;
            row.dead = false;
        }
        if (enable) {
            Person person = persons.findById(personId)
                .orElseThrow(() -> ApiException.notFound("PERSON_NOT_FOUND", "person not found"));
            String contact = channel.equals(NotificationChannelPref.EMAIL) ? person.email : person.phone;
            if (contact == null || contact.isBlank()) {
                throw ApiException.badRequest("CHANNEL_NO_CONTACT",
                    "set your profile " + channel.toLowerCase() + " contact before enabling this channel");
            }
            row.enabled = true;
            row.dead = false; // re-enable asserts the contact is fixed
        } else {
            row.enabled = false;
        }
        channelPrefs.save(row);
        log.info("channel_pref_set person={} channel={} enabled={}", personId, channel, row.enabled);
    }

    private ChannelState state(UUID personId, String channel, boolean hasContact) {
        NotificationChannelPref pref = channelPrefs.findByPersonIdAndChannel(personId, channel).orElse(null);
        return new ChannelState(channel, pref != null && pref.enabled, pref != null && pref.dead, hasContact);
    }

    private static boolean notBlank(String v) {
        return v != null && !v.isBlank();
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
