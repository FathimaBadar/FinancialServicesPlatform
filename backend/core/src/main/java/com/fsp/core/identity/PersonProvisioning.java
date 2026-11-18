package com.fsp.core.identity;

import com.fsp.core.common.ApiException;
import com.fsp.core.rbac.Permission;
import com.fsp.core.rbac.PermissionRepository;
import com.fsp.core.rbac.Role;
import com.fsp.core.rbac.RolePermission;
import com.fsp.core.rbac.RolePermissionRepository;
import com.fsp.core.rbac.RoleRepository;
import com.fsp.core.rbac.UserRole;
import com.fsp.core.rbac.RbacRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Person + role creation helpers shared by tenant creation and KYC onboarding.
 * Runs inside the caller's transaction (REQUIRED).
 */
@Slf4j
@Service
public class PersonProvisioning {

    private final PersonRepository personRepository;
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final RbacRepository rbacRepository;
    private final RolePermissionRepository rolePermissionRepository;
    private final PasswordEncoder encoder = new BCryptPasswordEncoder();

    public PersonProvisioning(PersonRepository personRepository, RoleRepository roleRepository,
                              PermissionRepository permissionRepository, RbacRepository rbacRepository,
                              RolePermissionRepository rolePermissionRepository) {
        this.personRepository = personRepository;
        this.roleRepository = roleRepository;
        this.permissionRepository = permissionRepository;
        this.rbacRepository = rbacRepository;
        this.rolePermissionRepository = rolePermissionRepository;
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public Person createPerson(UUID tenantId, String username, String fullName, String email,
                               String rawPassword, boolean applicant) {
        if (username == null || username.isBlank()) {
            throw ApiException.badRequest("USERNAME_INVALID", "username required");
        }
        if (personRepository.existsByUsername(username)) {
            throw ApiException.conflict("USERNAME_TAKEN", "username '%s' already exists".formatted(username));
        }
        Person p = new Person();
        p.id = UUID.randomUUID();
        p.tenantId = tenantId;
        p.username = username;
        p.fullName = fullName == null || fullName.isBlank() ? username : fullName;
        p.email = email;
        p.passwordHash = encoder.encode(rawPassword);
        p.status = "ACTIVE";
        p.isApplicant = applicant;
        Person saved = personRepository.save(p);
        log.info("person_created personId={} tenant={} username={} applicant={}",
            saved.id, tenantId, username, applicant);
        return saved;
    }

    /** Create (idempotent per tenant+key) a scoped role and wire the permission keys. */
    @Transactional(propagation = Propagation.REQUIRED)
    public Role ensureRole(UUID tenantId, String key, String name, String scope, List<String> permissionKeys) {
        Role role = roleRepository.findByTenantId(tenantId).stream()
            .filter(r -> key.equals(r.key))
            .findFirst()
            .orElseGet(() -> {
                Role r = new Role();
                r.id = UUID.randomUUID();
                r.tenantId = tenantId;
                r.key = key;
                r.name = name;
                r.scope = scope;
                Role saved = roleRepository.save(r);
                log.info("role_created roleId={} tenant={} key={} scope={}", saved.id, tenantId, key, scope);
                return saved;
            });
        for (String permKey : permissionKeys) {
            // validate against the global catalog so typos fail fast
            Permission catalogEntry = permissionRepository.findById(permKey)
                .orElseThrow(() -> ApiException.badRequest("PERMISSION_UNKNOWN",
                    "Unknown permission key '%s'".formatted(permKey)));
            boolean linked = rbacRepository.existsRolePermission(role.id, catalogEntry.key);
            if (!linked) {
                RolePermission rp = new RolePermission();
                rp.roleId = role.id;
                rp.permissionKey = catalogEntry.key;
                rolePermissionRepository.save(rp);
            }
        }
        return role;
    }

    /**
     * Marks a provisioned person as a designated checker (persons.is_checker). Only for the
     * checker an organization is BORN with (PSP creation / KYC saga) — every later change goes
     * through the four-eyes USER_CREATE / USER_UPDATE flow (docs/checker-flag.md).
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public Person designateChecker(Person person) {
        person.isChecker = true;
        Person saved = personRepository.save(person);
        log.info("person_designated_checker personId={} tenant={}", saved.id, saved.tenantId);
        return saved;
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void assignRole(UUID personId, UUID roleId) {
        if (rbacRepository.findByPersonId(personId).stream().anyMatch(ur -> ur.roleId.equals(roleId))) {
            return;
        }
        UserRole ur = new UserRole();
        ur.personId = personId;
        ur.roleId = roleId;
        rbacRepository.save(ur);
        log.info("role_assigned personId={} roleId={}", personId, roleId);
    }
}
