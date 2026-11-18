package com.fsp.core.actas;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Act as a tenant below your own (plans/act-as-tenant-plan.md).
 * These three calls are about the person, so {@link ActAsFilter} never applies a live session
 * to them: the start is always checked against the person's own tenant.
 */
@Slf4j
@RestController
public class ActAsController {

    private final ActAsService actAs;

    public ActAsController(ActAsService actAs) {
        this.actAs = actAs;
    }

    public record StartActAs(UUID tenantId) { }

    @FspOperation(id = "tenant.act-as.start", component = "tenant", permission = "tenant.act_as",
        risk = FspOperation.OperationRisk.FOUR_EYES,
        title = "Act as a tenant below your own (sudo)",
        actors = {Actor.ActorType.PERSON})
    @PostMapping("/v1/act-as")
    public ActAsService.ActAsView start(HttpServletRequest request,
                                        @RequestBody StartActAs body) {
        Actor actor = actor(request);
        if (body == null || body.tenantId() == null) {
            throw ApiException.badRequest("ACT_AS_INVALID", "tenantId is required");
        }
        return actAs.start(actor, body.tenantId());
    }

    @FspOperation(id = "tenant.act-as.current", component = "tenant", permission = "",
        title = "View current act-as session",
        actors = {Actor.ActorType.PERSON, Actor.ActorType.DELEGATED})
    @GetMapping("/v1/act-as")
    public ActAsService.ActAsView current(HttpServletRequest request) {
        Actor actor = actor(request);
        return actAs.current(actor);
    }

    @FspOperation(id = "tenant.act-as.end", component = "tenant", permission = "",
        title = "Exit act-as session",
        actors = {Actor.ActorType.PERSON, Actor.ActorType.DELEGATED})
    @DeleteMapping("/v1/act-as")
    public void end(HttpServletRequest request) {
        Actor actor = actor(request);
        actAs.end(actor);
    }

    private static Actor actor(HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null) throw ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        return actor;
    }
}
