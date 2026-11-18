package com.fsp.core.common;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Controller operation declaration (FAPI2 guide §3): the permission and resource binding
 * are declared ON the operation itself; operation IDs stay stable across URL/API changes.
 * The runtime inventory of these annotations IS the operation catalog seed (guide §3.1).
 * Enforcement is done by {@link FspOperationInterceptor} before handler execution.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD, ElementType.TYPE})
public @interface FspOperation {

    /** Stable operation id (e.g. journal.entry.approve) — never changes when URLs change. */
    String id();

    /** Permission key required; empty string = authenticated-only (no specific permission). */
    String permission() default "";

    /** Owning component (rbac | kyc | ledger | journal | audit | tenant | approval | platform). */
    String component();

    /** Risk class from the permission catalog. */
    OperationRisk risk() default OperationRisk.READ;

    /** Resource kind bound to the path (from ResourceKind). */
    String resource() default "TENANT";

    /** Human title for the generated catalog/role editor. */
    String title();

    /**
     * Actor planes allowed to invoke this operation. Default {PERSON} preserves Phase-0
     * semantics (persons only). Machine/delegated ops (plugin-facing) opt in explicitly.
     * Uses {@link Actor.ActorType} so there is a single actor-plane enum.
     */
    Actor.ActorType[] actors() default {Actor.ActorType.PERSON};

    enum OperationRisk { READ, WRITE, FOUR_EYES }
}
