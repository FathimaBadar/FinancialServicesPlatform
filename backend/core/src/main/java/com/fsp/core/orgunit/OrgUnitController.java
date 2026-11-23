package com.fsp.core.orgunit;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.FspOperation;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * An organization's branches and departments (read side; their maintenance screens come later).
 * Readable with {@code role.view} or {@code role.manage} — re-checked in {@link OrgUnitService}
 * because the operation catalog binds one key per route.
 */
@RestController
public class OrgUnitController {

    private final OrgUnitService service;

    public OrgUnitController(OrgUnitService service) {
        this.service = service;
    }

    @FspOperation(id = "org.branch.list", component = "orgunit", risk = FspOperation.OperationRisk.READ,
        title = "List an organization's branches")
    @GetMapping("/v1/tenants/{tenantId}/branches")
    public OrgUnitDtos.OrgUnitPage branches(HttpServletRequest request, @PathVariable("tenantId") UUID tenantId,
                                            @RequestParam(value = "page", defaultValue = "0") int page,
                                            @RequestParam(value = "size", defaultValue = "20") int size,
                                            @RequestParam(value = "sort", required = false) String sort,
                                            @RequestParam(value = "q", required = false) String q,
                                            @RequestParam(value = "status", required = false) String status) {
        return service.list(OrgUnitService.Kind.BRANCH, tenantId, page, size, sort, q, status, actor(request));
    }

    @FspOperation(id = "org.department.list", component = "orgunit", risk = FspOperation.OperationRisk.READ,
        title = "List an organization's departments")
    @GetMapping("/v1/tenants/{tenantId}/departments")
    public OrgUnitDtos.OrgUnitPage departments(HttpServletRequest request, @PathVariable("tenantId") UUID tenantId,
                                               @RequestParam(value = "page", defaultValue = "0") int page,
                                               @RequestParam(value = "size", defaultValue = "20") int size,
                                               @RequestParam(value = "sort", required = false) String sort,
                                               @RequestParam(value = "q", required = false) String q,
                                               @RequestParam(value = "status", required = false) String status) {
        return service.list(OrgUnitService.Kind.DEPARTMENT, tenantId, page, size, sort, q, status, actor(request));
    }

    private static Actor actor(HttpServletRequest request) {
        Actor actor = (Actor) request.getAttribute("fsp.actor");
        if (actor == null) throw ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        return actor;
    }
}
