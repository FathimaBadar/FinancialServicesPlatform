package com.fsp.core.rbac;

import org.springframework.data.repository.CrudRepository;

import java.util.UUID;

public interface RolePermissionRepository extends CrudRepository<RolePermission, RolePermissionId> {
}
