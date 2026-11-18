package com.fsp.core.plugin.authz;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import com.fsp.core.tenant.Tenant;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Tenant subtree read endpoint (§12.7 organizations API).
 * GET /v1/tenants/{id}/subtree — paged list of all descendants of a tenant.
 * Bounded: size 1–100, sort by allow-listed public names only.
 */
@Slf4j
@RestController
public class TenantSubtreeController {

    private final TenantSubtreeService service;

    public TenantSubtreeController(TenantSubtreeService service) {
        this.service = service;
    }

    @FspOperation(id = "tenant.subtree.read", component = "tenant", permission = "kyc.review",
        risk = FspOperation.OperationRisk.READ,
        title = "List tenant subtree (organizations API)",
        actors = {Actor.ActorType.DELEGATED, Actor.ActorType.PERSON})
    @GetMapping("/v1/tenants/{id}/subtree")
    public Page<Tenant> subtree(@PathVariable("id") UUID id,
                                @RequestParam(value = "page", required = false, defaultValue = "0") int page,
                                @RequestParam(value = "size", required = false, defaultValue = "25") int size,
                                @RequestParam(value = "sort", required = false, defaultValue = "createdAt,desc") String sort,
                                HttpServletRequest request) {
        Actor actor = actor(request);

        // Bound size (AGENTS §4A: 1–100)
        if (size < 1 || size > 100) {
            throw ApiException.badRequest("PAGE_SIZE_INVALID", "size must be between 1 and 100");
        }

        // Allow-listed sort names (public ⇄ persistence map, §12.4)
        String sortProperty = parseSortProperty(sort);
        Sort.Direction direction = sort.contains(",") && sort.split(",")[1].trim().equalsIgnoreCase("asc")
            ? Sort.Direction.ASC : Sort.Direction.DESC;

        PageRequest pageable = PageRequest.of(page, size, direction, sortProperty);
        return service.subtree(id, pageable, actor);
    }

    private String parseSortProperty(String sort) {
        if (sort == null || sort.isBlank()) return "createdAt";
        String[] parts = sort.split(",", 2);
        String prop = parts[0].trim();
        // Public ⇄ persistence map (§12.4)
        return switch (prop) {
            case "legalName" -> "legalName";
            case "status" -> "status";
            case "subType" -> "subType";
            case "createdAt", "updatedAt" -> prop;
            default -> "createdAt";
        };
    }

    private static Actor actor(HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null) throw ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        return actor;
    }

    private static String asString(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
