package com.fsp.core.rbac;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "role_permissions")
@IdClass(RolePermissionId.class)
public class RolePermission {

    @Id
    public UUID roleId;
    @Id
    public String permissionKey;
}

class RolePermissionId implements Serializable {
    public UUID roleId;
    public String permissionKey;

    public RolePermissionId() {}

    public RolePermissionId(UUID roleId, String permissionKey) {
        this.roleId = roleId;
        this.permissionKey = permissionKey;
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof RolePermissionId that)) return false;
        return roleId.equals(that.roleId) && permissionKey.equals(that.permissionKey);
    }

    @Override
    public int hashCode() {
        return Objects.hash(roleId, permissionKey);
    }
}
