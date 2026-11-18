package com.fsp.core.plugin.events;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.outbox.OutboxEvent;
import com.fsp.core.outbox.OutboxRepository;
import com.fsp.core.rbac.PermissionService;
import com.fsp.core.plugin.registry.PluginTypeRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Core-owned plugin event feed (§8 of plugin-platform-plan).
 * Core's dispatcher copies matching outbox events into plugin_event_feed.
 * Plugins poll via GET /v1/plugins/events (long-poll) and ack via POST /v1/plugins/events/ack.
 * At-least-once delivery; plugins must be idempotent per seq.
 */
@Slf4j
@Service
public class PluginEventService {

    private final PluginEventFeedRepository feedRepository;
    private final PluginEventCursorRepository cursorRepository;
    private final PluginEventSubscriptionRepository subscriptionRepository;
    private final OutboxRepository outboxRepository;
    private final PluginTypeRepository pluginTypeRepository;

    public PluginEventService(PluginEventFeedRepository feedRepository,
                              PluginEventCursorRepository cursorRepository,
                              PluginEventSubscriptionRepository subscriptionRepository,
                              OutboxRepository outboxRepository,
                              PluginTypeRepository pluginTypeRepository) {
        this.feedRepository = feedRepository;
        this.cursorRepository = cursorRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.outboxRepository = outboxRepository;
        this.pluginTypeRepository = pluginTypeRepository;
    }

    /** Dispatch matching outbox events to plugin feeds. Called on a schedule.
     *  Uses publishedAt == null as the undispatched marker. */
    @Scheduled(fixedRate = 5000)
    @Transactional
    public void dispatchOutboxToFeeds() {
        List<OutboxEvent> undispatched = outboxRepository.findTop100ByPublishedAtIsNullOrderByCreatedAtAsc();
        for (OutboxEvent event : undispatched) {
            // Find plugins subscribed to this event type
            var plugins = pluginTypeRepository.findByStatus("REGISTERED");
            for (var plugin : plugins) {
                boolean subscribed = subscriptionRepository.findByPluginCode(plugin.code).stream()
                    .anyMatch(s -> s.eventName.equals(event.eventName));
                if (subscribed) {
                    PluginEventFeed feedRow = new PluginEventFeed();
                    feedRow.pluginCode = plugin.code;
                    feedRow.eventName = event.eventName;
                    feedRow.payload = event.payload;
                    feedRow.tenantId = null; // extracted from payload by plugin
                    feedRow.correlationId = null;
                    feedRow.createdAt = Instant.now();
                    feedRepository.save(feedRow);
                }
            }
            event.publishedAt = Instant.now();
            outboxRepository.save(event);
        }
    }

    /** Poll the event feed for a plugin (machine-only, long-poll). */
    public FeedPage poll(String pluginCode, long after, int limit, int waitSeconds) {
        // Cap wait (≤ 20s per §9.5)
        int wait = Math.min(Math.max(waitSeconds, 0), 20);

        // Get events after the cursor
        List<PluginEventFeed> events = feedRepository.findByPluginCodeAndSeqGreaterThanOrderBySeqAsc(pluginCode, after);

        // Long-poll: if no events and wait > 0, wait briefly
        if (events.isEmpty() && wait > 0) {
            try { Thread.sleep(wait * 1000L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            events = feedRepository.findByPluginCodeAndSeqGreaterThanOrderBySeqAsc(pluginCode, after);
        }

        boolean hasGap = false;
        long nextAfter = after;
        if (!events.isEmpty()) {
            nextAfter = events.get(events.size() - 1).seq;
            hasGap = events.get(0).seq > after + 1;
        }

        return new FeedPage(events, nextAfter, hasGap);
    }

    /** Ack a cursor — records the last acknowledged seq for a plugin. */
    @Transactional
    public void ack(String pluginCode, long seq, Actor actor) {
        if (actor.type() != Actor.ActorType.MACHINE) {
            throw ApiException.forbidden("MACHINE_ONLY", "Only a plugin machine actor can ack events");
        }

        var cursor = cursorRepository.findById(pluginCode);
        PluginEventCursor c;
        if (cursor.isPresent()) {
            c = cursor.get();
        } else {
            c = new PluginEventCursor(pluginCode, 0);
        }
        if (seq > c.lastAckSeq) {
            c.lastAckSeq = seq;
            c.updatedAt = Instant.now();
            cursorRepository.save(c);
        }
        log.debug("event_cursor_acked plugin={} seq={}", pluginCode, seq);
    }

    public record FeedPage(List<PluginEventFeed> items, long nextAfter, boolean hasGap) {}
}
