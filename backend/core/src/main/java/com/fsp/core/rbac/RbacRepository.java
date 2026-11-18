package com.fsp.core.rbac;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface RbacRepository extends JpaRepository<UserRole, UserRoleId> {

    @Query("""
        select distinct rp.permissionKey
        from RolePermission rp
        where rp.roleId in (select ur.roleId from UserRole ur where ur.personId = :personId)
        """)
    List<String> permissionKeysForPerson(@Param("personId") UUID personId);

    List<UserRole> findByPersonId(UUID personId);

    long deleteByPersonIdAndRoleId(UUID personId, UUID roleId);

    List<UserRole> findByPersonIdIn(java.util.Collection<UUID> personIds);

    @Query("select rp.permissionKey from RolePermission rp where rp.roleId = :roleId")
    List<String> permissionKeysForRole(@Param("roleId") UUID roleId);

    @Query("select count(rp) > 0 from RolePermission rp where rp.roleId = :roleId and rp.permissionKey = :permissionKey")
    boolean existsRolePermission(@Param("roleId") UUID roleId, @Param("permissionKey") String permissionKey);
}
