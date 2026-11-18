package com.fsp.core.audit;

import com.fsp.core.common.FspOperation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/v1/tenants/{tenantId}/audit")
public class AuditController {

    private final AuditRepository repository;
    private final com.fsp.core.rbac.PermissionService permissionService;

    public AuditController(AuditRepository repository, com.fsp.core.rbac.PermissionService permissionService) {
        this.repository = repository;
        this.permissionService = permissionService;
    }

    @FspOperation(id = "audit.list", component = "audit", permission = "audit.view",
        title = "View audit trail")
    @GetMapping
    public Page<AuditRecord> list(@PathVariable UUID tenantId,
                                  @RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "50") int size,
                                  @org.springframework.web.bind.annotation.RequestParam(required = false) String correlationId,
                                  jakarta.servlet.http.HttpServletRequest request) {
        var actor = actor(request);
        permissionService.require(actor, "audit.view", tenantId);
        Page<AuditRecord> result = repository.findByTenantIdOrderByTimestampUtcDesc(
            tenantId, org.springframework.data.domain.PageRequest.of(Math.min(page, 100), Math.min(size, 100)));
        if (correlationId != null && !correlationId.isBlank()) {
            var list = result.getContent().stream()
                .filter(r -> r.correlationId.contains(correlationId)).toList();
            return new org.springframework.data.domain.PageImpl<>(list, result.getPageable(), list.size());
        }
        return result;
    }

    private com.fsp.core.common.Actor actor(jakarta.servlet.http.HttpServletRequest request) {
        com.fsp.core.common.Actor actor = (com.fsp.core.common.Actor) request.getAttribute("fsp.actor");
        if (actor == null) throw com.fsp.core.common.ApiException.unauthorized("ACTOR_MISSING", "No authenticated actor");
        return actor;
    }
}
