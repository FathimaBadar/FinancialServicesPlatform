package com.fsp.core.rbac;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
public class RbacController {

    private final PermissionService permissionService;
    private final com.fsp.core.identity.PersonRepository persons;

    public RbacController(PermissionService permissionService, com.fsp.core.identity.PersonRepository persons) {
        this.permissionService = permissionService;
        this.persons = persons;
    }

    @FspOperation(id = "rbac.permission.catalog", component = "rbac", title = "List permission definitions")
    @GetMapping("/v1/permissions")
    public List<Map<String, Object>> catalog() {
        return permissionService.catalog().stream()
            .map(p -> Map.<String, Object>of(
                "key", p.key, "title", p.title, "risk", p.risk, "component", p.component))
            .toList();
    }

    @FspOperation(id = "rbac.permission.me", component = "rbac", title = "My effective permissions")
    @GetMapping("/v1/me/permissions")
    public Map<String, Object> myPermissions(jakarta.servlet.http.HttpServletRequest request) {
        Actor actor = actor(request);
        var keys = permissionService.effectiveKeys(actor, actor.activeTenantId());
        boolean checker = actor.personId() != null
            && persons.findById(actor.personId()).map(p -> p.isChecker).orElse(false);
        return Map.of(
            "tenantId", actor.activeTenantId().toString(),
            "permissions", keys.stream().sorted().toList(),
            "checker", checker);
    }

    private Actor actor(jakarta.servlet.http.HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null) {
            throw ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        }
        return actor;
    }
}
