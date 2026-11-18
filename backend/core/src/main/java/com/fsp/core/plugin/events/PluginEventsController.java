package com.fsp.core.plugin.events;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Plugin event feed controller (§8 of plugin-platform-plan).
 * Core serves the feed through the gateway (Path C). Plugins poll and ack.
 * Machine-only operations: actors={MACHINE}.
 */
@Slf4j
@RestController
public class PluginEventsController {

    private final PluginEventService service;

    public PluginEventsController(PluginEventService service) {
        this.service = service;
    }

    @FspOperation(id = "plugin.events.read", component = "platform", permission = "plugin.events.read",
        risk = FspOperation.OperationRisk.READ,
        title = "Poll plugin event feed (machine-only, long-poll)",
        actors = {Actor.ActorType.MACHINE})
    @GetMapping("/v1/plugins/events")
    public PluginEventService.FeedPage poll(
            @RequestParam(value = "after", required = false, defaultValue = "0") long after,
            @RequestParam(value = "limit", required = false, defaultValue = "100") int limit,
            @RequestParam(value = "wait", required = false, defaultValue = "0") int waitSeconds,
            HttpServletRequest request) {
        Actor actor = actor(request);

        if (limit < 1 || limit > 100) {
            throw ApiException.badRequest("PAGE_SIZE_INVALID", "limit must be between 1 and 100");
        }

        return service.poll(actor.clientId(), after, limit, waitSeconds);
    }

    @FspOperation(id = "plugin.events.ack", component = "platform", permission = "plugin.events.ack",
        risk = FspOperation.OperationRisk.WRITE,
        title = "Ack plugin event cursor (machine-only)",
        actors = {Actor.ActorType.MACHINE})
    @PostMapping("/v1/plugins/events/ack")
    public Map<String, Object> ack(@RequestBody Map<String, Object> body,
                                   HttpServletRequest request) {
        Actor actor = actor(request);

        String pluginCode = actor.clientId();
        Long seq = asLong(body.get("seq"), "seq");
        if (seq == null) {
            throw ApiException.badRequest("ACK_INVALID", "seq is required");
        }

        service.ack(pluginCode, seq, actor);
        return Map.of("acked", true, "pluginCode", pluginCode, "seq", seq);
    }

    private static Actor actor(HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null) throw ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        return actor;
    }

    private static Long asLong(Object v, String field) {
        if (v == null) return null;
        try { return Long.valueOf(String.valueOf(v)); }
        catch (NumberFormatException e) {
            throw ApiException.badRequest("ACK_INVALID", field + " must be a number");
        }
    }
}
