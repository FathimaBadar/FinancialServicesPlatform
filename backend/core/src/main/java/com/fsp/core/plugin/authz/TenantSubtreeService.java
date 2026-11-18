package com.fsp.core.plugin.authz;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.rbac.PermissionService;
import com.fsp.core.tenant.Tenant;
import com.fsp.core.tenant.TenantRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Tenant subtree read (§5.4 I6, §12.7 organizations API).
 * Returns all descendants of a tenant (subtree visibility), paged.
 * The caller must have reachability to the root tenant.
 */
@Slf4j
@Service
public class TenantSubtreeService {

    private final TenantRepository tenantRepository;
    private final PermissionService permissions;

    public TenantSubtreeService(TenantRepository tenantRepository, PermissionService permissions) {
        this.tenantRepository = tenantRepository;
        this.permissions = permissions;
    }

    @Transactional(readOnly = true)
    public Page<Tenant> subtree(UUID ancestorId, Pageable pageable, Actor actor) {
        Tenant ancestor = tenantRepository.findById(ancestorId)
            .orElseThrow(() -> ApiException.notFound("TENANT_NOT_FOUND", "Tenant not found"));

        // Caller must be able to reach the ancestor
        permissions.requireAny(actor, List.of(
            "kyc.review", "kyc.approve", "org.create", "org.activate", "audit.view"), ancestorId);

        // Collect all descendants via hierarchy_path prefix match
        String prefix = ancestor.hierarchyPath + "/";
        List<Tenant> allDescendants = new ArrayList<>();
        collectDescendants(ancestorId, prefix, allDescendants);

        // Page manually
        int start = (int) pageable.getOffset();
        int end = Math.min(start + pageable.getPageSize(), allDescendants.size());
        List<Tenant> page = start < allDescendants.size()
            ? allDescendants.subList(start, end)
            : List.of();

        return new PageImpl<>(page, pageable, allDescendants.size());
    }

    private void collectDescendants(UUID parentId, String prefix, List<Tenant> out) {
        List<Tenant> children = tenantRepository.findByParentTenantId(parentId);
        for (Tenant child : children) {
            if (child.hierarchyPath.startsWith(prefix)) {
                out.add(child);
                collectDescendants(child.id, prefix, out);
            }
        }
    }
}
