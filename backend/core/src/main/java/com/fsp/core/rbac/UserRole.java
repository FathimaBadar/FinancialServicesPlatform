package com.fsp.core.rbac;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "user_roles")
@IdClass(UserRoleId.class)
public class UserRole {

    @Id
    public UUID personId;
    @Id
    public UUID roleId;

    public UserRoleId id() {
        return new UserRoleId(personId, roleId);
    }
}

class UserRoleId implements Serializable {
    public UUID personId;
    public UUID roleId;

    public UserRoleId() {}

    public UserRoleId(UUID personId, UUID roleId) {
        this.personId = personId;
        this.roleId = roleId;
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof UserRoleId that)) return false;
        return personId.equals(that.personId) && roleId.equals(that.roleId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(personId, roleId);
    }
}
