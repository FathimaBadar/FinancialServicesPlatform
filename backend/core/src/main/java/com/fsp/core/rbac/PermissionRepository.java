package com.fsp.core.rbac;

import org.springframework.data.repository.CrudRepository;

public interface PermissionRepository extends CrudRepository<Permission, String> {
}
