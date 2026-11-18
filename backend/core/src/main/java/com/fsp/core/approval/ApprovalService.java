package com.fsp.core.approval;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import com.fsp.core.common.HashUtil;
import com.fsp.core.common.KeyLocks;
import com.fsp.core.outbox.OutboxService;
import com.fsp.core.rbac.PermissionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Generic four-eyes engine: approval rows are opened by domain flows (with-kyc, JE submit)
 * and resolved by the checker from the queue or the owning domain endpoint. Resolution is
 * idempotent ONLY when identical (same checker, same decision); anything else conflicts.
 * Every resolution dispatches to the owning domain via {@link ApprovalHandler} by OpType.
 */
@Slf4j
@Service
public class ApprovalService {

    private final ApprovalRequestRepository repository;
    private final PermissionService permissions;
    private final KeyLocks keyLocks;
    private final com.fsp.core.audit.AuditService audit;
    private final OutboxService outbox;
    private final com.fsp.core.identity.PersonRepository persons;
    private final com.fsp.core.plugin.registry.PluginTypeRepository pluginTypes;
    private final Map<String, ApprovalHandler> handlers = new HashMap<>();
    private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER = new com.fasterxml.jackson.databind.ObjectMapper();

    public ApprovalService(ApprovalRequestRepository repository, PermissionService permissions,
                           KeyLocks keyLocks, com.fsp.core.audit.AuditService audit,
                           OutboxService outbox, List<ApprovalHandler> handlerList,
                           com.fsp.core.identity.PersonRepository persons,
                           com.fsp.core.plugin.registry.PluginTypeRepository pluginTypes) {
        this.repository = repository;
        this.permissions = permissions;
        this.keyLocks = keyLocks;
        this.audit = audit;
        this.outbox = outbox;
        this.persons = persons;
        this.pluginTypes = pluginTypes;
        for (ApprovalHandler h : handlerList) handlers.put(h.operationType(), h);
    }

    // ---------- open (maker side) ----------

    @Transactional
    public ApprovalRequest open(UUID tenantId, String operationType, UUID targetResourceId,
                                Actor maker, String payloadDescription, String payload) {
        return open(tenantId, operationType, targetResourceId, maker, maker == null ? null : maker.personId(), payloadDescription, payload, null);
    }

    /** Look up an approval request by id (used by domain handlers). */
    public ApprovalRequest findById(UUID approvalId) {
        return repository.findById(approvalId)
            .orElseThrow(() -> ApiException.notFound("APPROVAL_NOT_FOUND",
                "Approval request %s not found".formatted(approvalId)));
    }

    /** Overload used when the maker is NOT the caller (e.g. with-kyc: submittedBy = PSP admin). */
    @Transactional
    public ApprovalRequest open(UUID tenantId, String operationType, UUID targetResourceId,
                                Actor contextActor, UUID makerId, String payloadDescription, String payload) {
        return open(tenantId, operationType, targetResourceId, contextActor, makerId, payloadDescription, payload, null);
    }

    /** Full overload with client attribution for plugin-mediated (DELEGATED) approvals. */
    @Transactional
    public ApprovalRequest open(UUID tenantId, String operationType, UUID targetResourceId,
                                Actor contextActor, UUID makerId, String payloadDescription, String payload,
                                String clientId) {
        String opType = canonicalOpType(operationType);

        // Machine maker refusal (plugin-platform-plan §7.1): a machine actor can never be a maker.
        // DELEGATED carries a personId and is allowed — the person is the maker.
        if (contextActor != null && contextActor.type() == Actor.ActorType.MACHINE) {
            log.warn("machine_maker_refused opType={} clientId={}", opType, contextActor.clientId());
            throw ApiException.forbidden("MACHINE_MAKER",
                "A plugin machine actor cannot be a maker; four-eyes is person-anchored at person_id");
        }

        String payloadHash = HashUtil.sha256Hex(opType + "|" + targetResourceId + "|" + payloadDescription);
        ApprovalRequest row = new ApprovalRequest();
        row.id = UUID.randomUUID();
        row.tenantId = tenantId;
        row.operationType = opType;
        row.targetResourceId = targetResourceId;
        row.payloadHash = payloadHash;
        row.payload = payload;
        row.makerId = makerId;
        row.clientId = clientId;
        repository.save(row);
        log.info("approval_opened approvalId={} type={} target={} maker={} tenant={}",
            row.id, opType, targetResourceId, makerId, tenantId);
        outbox.record("ApprovalRequest", row.id, "Approval.Requested",
            "{\"approvalId\":\"%s\",\"type\":\"%s\",\"target\":\"%s\"}".formatted(row.id, opType, targetResourceId));
        return row;
    }

    // ---------- resolve (checker side) ----------

    /**
     * Queue/endpoint resolution by approval id. Four-eyes + state precondition here,
     * then dispatch to the owning domain handler. Serializes per approval id (§2d).
     * The required permission depends on the operation domain.
     */
    public void resolve(UUID approvalId, boolean approved, Actor checker, String reason) {
        ApprovalRequest row = repository.findById(approvalId)
            .orElseThrow(() -> ApiException.notFound("APPROVAL_NOT_FOUND", "Approval request not found"));
        requirePluginOwnsApproval(row, checker);
        requirePermissionFor(row, checker);
        keyLocks.withLock("approval", approvalId, () -> resolveLocked(approvalId, approved, checker, reason));
    }

    /** A plugin acting for a person may resolve ONLY approvals its own client opened (plan §7.1). */
    private void requirePluginOwnsApproval(ApprovalRequest row, Actor checker) {
        String client = checker.clientId();
        if (checker.type() != Actor.ActorType.DELEGATED || client == null || !client.startsWith("plugin-")) return;
        String prefix = "PLUGIN:" + client.substring("plugin-".length()) + ":";
        if (!row.operationType.startsWith(prefix) || !client.equals(row.clientId)) {
            log.warn("plugin_resolve_foreign_approval approvalId={} type={} client={}", row.id, row.operationType, client);
            throw ApiException.forbidden("APPROVAL_CLIENT_MISMATCH",
                "Client '%s' may only resolve approvals it opened".formatted(client));
        }
    }

    /** Permission required to resolve an approval, by operation domain. */
    private void requirePermissionFor(ApprovalRequest row, Actor checker) {
        if (row.operationType.startsWith("PLUGIN:")) {
            String perm = pluginCheckerPermission(row.operationType);
            permissions.require(checker, perm, row.tenantId);
            // Plugin-mediated resolution: the plugin's client must also hold the grant (ON_BEHALF)
            if (checker.type() == Actor.ActorType.DELEGATED) {
                permissions.requireClient(checker.clientId(), perm, row.tenantId);
            }
            return;
        }
        String perm = switch (row.operationType) {
            case ApprovalRequest.OpType.KYC_TENANT_ACTIVATION -> "kyc.approve";
            case ApprovalRequest.OpType.JE_POSTING -> "je.approve";
            case ApprovalRequest.OpType.UI_LAYOUT_PUBLISH -> "ui.layout.manage";
            case ApprovalRequest.OpType.USER_CREATE,
                 ApprovalRequest.OpType.USER_UPDATE,
                 ApprovalRequest.OpType.USER_DEACTIVATE,
                 ApprovalRequest.OpType.USER_ACTIVATE,
                 ApprovalRequest.OpType.USER_REMOVE -> "user.manage";
            case ApprovalRequest.OpType.PLUGIN_REGISTER,
                 ApprovalRequest.OpType.PLUGIN_INSTALL -> "plugin.manage";
            default -> "user.manage";
        };
        permissions.require(checker, perm, row.tenantId);
    }

    /** checkerPermission declared by the REGISTERED plugin manifest for "PLUGIN:<code>:<action>". */
    private String pluginCheckerPermission(String opType) {
        String[] parts = opType.split(":", 3);
        if (parts.length == 3) {
            for (var t : pluginTypes.findByCodeAndStatus(parts[1], "REGISTERED")) {
                try {
                    for (var a : MAPPER.readTree(t.manifest).path("approvals")) {
                        String perm = a.path("checkerPermission").asText();
                        if (parts[2].equals(a.path("action").asText()) && !perm.isBlank()) return perm;
                    }
                } catch (Exception e) {
                    log.warn("plugin_manifest_unreadable code={}", parts[1]);
                }
            }
        }
        log.warn("plugin_checker_permission_undeclared opType={}", opType);
        throw ApiException.forbidden("APPROVAL_NOT_DECLARED",
            "No checker permission is declared for %s".formatted(opType));
    }

    /** Checker flag (docs/checker-flag.md): only persons flagged is_checker may resolve approvals. */
    private void requireCheckerFlag(Actor checker) {
        boolean flagged = checker.personId() != null
            && persons.findById(checker.personId()).map(p -> p.isChecker).orElse(false);
        if (!flagged) {
            log.warn("checker_flag_missing personId={}", checker.personId());
            throw ApiException.forbidden("CHECKER_NOT_ENABLED",
                "You are not enabled as a checker; ask an administrator to set the checker flag on your user");
        }
    }

    @Transactional
    protected void resolveLocked(UUID approvalId, boolean approved, Actor checker, String reason) {
        ApprovalRequest row = repository.findById(approvalId)
            .orElseThrow(() -> ApiException.notFound("APPROVAL_NOT_FOUND", "Approval request not found"));
        resolveRow(row, approved, checker, reason);
        ApprovalHandler handler = handlers.get(row.operationType);
        if (handler != null) {
            handler.apply(row, approved, checker, reason);
        } else {
            log.debug("approval_evidence_only approvalId={} type={}", row.id, row.operationType);
        }
    }

    /**
     * Evidence resolution from a domain flow (KYC decide, JE approve). Idempotent: re-resolving
     * the same (checker, decision) is a no-op; anything else throws. Returns the row.
     */
    @Transactional
    public ApprovalRequest resolveByTarget(UUID tenantId, String operationType, UUID targetResourceId,
                                           boolean approved, Actor checker, String reason) {
        String opType = canonicalOpType(operationType);
        ApprovalRequest row = repository.findByOperationTypeAndTargetResourceId(opType, targetResourceId)
            .orElse(null);
        if (row == null) {
            log.warn("approval_missing_for_domain tenantId={} type={} target={} — creating evidence row",
                tenantId, opType, targetResourceId);
            return open(tenantId, opType, targetResourceId, checker, checker.personId(), "late-opened evidence", null);
        }
        resolveRow(row, approved, checker, reason);
        return row;
    }

    /** Core transition (caller supplies tx). Same checker + same decision → silent no-op. */
    private void resolveRow(ApprovalRequest row, boolean approved, Actor checker, String reason) {
        if (row.status.equals(ApprovalRequest.Status.APPROVED)
            && approved && checker.personId().equals(row.checkerId)) {
            return;
        }
        if (row.status.equals(ApprovalRequest.Status.REJECTED)
            && !approved && checker.personId().equals(row.checkerId)) {
            return;
        }
        if (!ApprovalRequest.Status.PENDING_CHECKER.equals(row.status)) {
            log.warn("approval_transition_conflict approvalId={} status={} attempted={} checker={}",
                row.id, row.status, approved ? "APPROVE" : "REJECT", checker.personId());
            throw ApiException.conflict("APPROVAL_STATE",
                "Approval already decided (%s)".formatted(row.status));
        }
        permissions.requireDistinctPerson(checker, row.makerId);
        requireCheckerFlag(checker);

        row.checkerId = checker.personId();
        row.status = approved ? ApprovalRequest.Status.APPROVED : ApprovalRequest.Status.REJECTED;
        row.reason = reason;
        row.decidedAt = java.time.Instant.now();
        repository.save(row);

        audit.record(row.makerId, row.checkerId, row.tenantId, null, "APPROVAL_RESOLVED", "APPROVAL_REQUEST",
            row.id.toString(), audit.hashState("status=PENDING_CHECKER"),
            audit.hashState("status=" + row.status + ";type=" + row.operationType), false);
        outbox.record("ApprovalRequest", row.id, "Approval.Resolved",
            "{\"approvalId\":\"%s\",\"type\":\"%s\",\"status\":\"%s\"}".formatted(row.id, row.operationType, row.status));
        log.info("approval_resolved approvalId={} type={} status={} checker={}",
            row.id, row.operationType, row.status, row.checkerId);
    }

    // ---------- queue ----------

    public List<ApprovalDtos.QueueView> queue(UUID tenantId, List<String> statuses, Actor actor) {
        permissions.requireAny(actor, List.of("kyc.approve", "je.approve", "kyc.review", "ui.layout.manage"), tenantId);
        List<ApprovalRequest> rows = (statuses == null || statuses.isEmpty())
            ? repository.findByTenantIdOrderByRequestedAtDesc(tenantId)
            : repository.findByTenantIdAndStatusOrderByRequestedAtDesc(tenantId, statuses.getFirst());
        return rows.stream().map(r -> new ApprovalDtos.QueueView(r.id, r.tenantId, r.operationType,
            r.targetResourceId, r.status, r.makerId, r.checkerId, r.reason, r.requestedAt, r.decidedAt)).toList();
    }

    private static String canonicalOpType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.badRequest("APPROVAL_TYPE", "operationType required");
        }
        // PLUGIN: prefix passes through verbatim — no enumeration of plugin types in OpType (plugin-platform-plan §7.1, D9)
        if (raw.startsWith("PLUGIN:")) return raw;
        return switch (raw) {
            case ApprovalRequest.OpType.KYC_TENANT_ACTIVATION ->
                ApprovalRequest.OpType.KYC_TENANT_ACTIVATION;
            case ApprovalRequest.OpType.JE_POSTING -> ApprovalRequest.OpType.JE_POSTING;
            case ApprovalRequest.OpType.USER_CREATE -> ApprovalRequest.OpType.USER_CREATE;
            case ApprovalRequest.OpType.USER_UPDATE -> ApprovalRequest.OpType.USER_UPDATE;
            case ApprovalRequest.OpType.USER_DEACTIVATE -> ApprovalRequest.OpType.USER_DEACTIVATE;
            case ApprovalRequest.OpType.USER_ACTIVATE -> ApprovalRequest.OpType.USER_ACTIVATE;
            case ApprovalRequest.OpType.USER_REMOVE -> ApprovalRequest.OpType.USER_REMOVE;
            case ApprovalRequest.OpType.UI_LAYOUT_PUBLISH -> ApprovalRequest.OpType.UI_LAYOUT_PUBLISH;
            case ApprovalRequest.OpType.PLUGIN_REGISTER -> ApprovalRequest.OpType.PLUGIN_REGISTER;
            case ApprovalRequest.OpType.PLUGIN_INSTALL -> ApprovalRequest.OpType.PLUGIN_INSTALL;
            default -> ApprovalRequest.OpType.GENERIC;
        };
    }
}
