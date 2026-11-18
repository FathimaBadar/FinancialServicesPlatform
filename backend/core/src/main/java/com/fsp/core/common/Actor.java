package com.fsp.core.common;

import java.util.UUID;

/**
 * Authenticated caller forwarded by the BFF via trusted headers.
 *
 * Plane (AGENTS.md plugin-platform-plan §4):
 *  - PERSON: a human actor (personId set, clientId null) — core's original actor model
 *  - MACHINE: a plugin's OAuth client (personId null, clientId set) — machine-to-machine calls
 *  - DELEGATED: a plugin acting on behalf of a person (personId set, clientId set) — on-behalf calls
 *
 * A compatibility constructor keeps the 3-arg call sites (ActorContextFilter,
 * UserAdminService, tests) compiling unchanged — they map to PERSON with null clientId.
 */
public record Actor(UUID personId, String username, UUID activeTenantId, ActorType type, String clientId) {

    public enum ActorType { PERSON, MACHINE, DELEGATED }

    public Actor(UUID personId, String username, UUID activeTenantId) {
        this(personId, username, activeTenantId, ActorType.PERSON, null);
    }
}
