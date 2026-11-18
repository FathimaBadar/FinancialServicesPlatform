# FSP Spring Boot Implementation Guide

**Audience:** Platform, gateway, RBAC, API and plugin engineering teams  
**Baseline:** Java 25, Spring Boot 4.0.x, Spring Security 7.0.x managed by Boot, and Spring Cloud 2025.1.x for Spring Cloud Gateway. Pin supported patches in the build BOM and verify the locked versions in CI.  
**Status:** Proposed implementation standard. The Java and configuration examples define contracts for the implementation team. They have not been compiled against an FSP codebase.

A developer declares the business operation and its required permission once, on the controller method. The FSP SDK exports that declaration to the RBAC catalog and checks that the deployed route matches it. Administrators use the catalog to create roles and assign permissions within their delegated authority. The gateway admits only explicitly registered traffic that meets its route's security policy. The service authorizes the actual resource and the application layer enforces approval and financial invariants.

## 1. Deployment and trust boundaries

| Component | What it owns | Key enforcement |
|---|---|---|
| Upstream IdP | User authentication and federation | Approved issuer, stable subject, verified authentication assurance. Supplier IdP groups enter only through approved mappings. |
| FSP authorization server | OAuth client registration, grants, consent, tokens and authorization details | Authenticated PAR, S256 PKCE, redirect validation, sender-constrained token issuance, client and tenant restrictions, key rotation. |
| Edge and API gateway | Public traffic admission and the external protected resource boundary | DDoS mitigation at the edge. At the gateway, explicit routes, token and sender proof, audience, coarse authorization details and resource budgets. |
| Spring Boot service or plugin | Internal resource boundary and operation enforcement | Internal caller identity, intended audience and operation, active installation, resource ownership and current RBAC. |
| Root and supplier RBAC | Permission catalog, role definitions, assignment and delegation | Root ceilings per scope, administrative approval, live effective permissions, descendant revocation and decision evidence. |
| FSP core | Sensitive commands and authoritative financial mutations | Maker-checker, idempotency, entitlement, journal construction, ledger recovery and authoritative audit. |

Use a confidential server-side BFF for browser clients in the initial design. Keep OAuth credentials and tokens server-side. Use a Secure, HttpOnly session cookie, an appropriate SameSite policy, and CSRF protection on session-authenticated writes. The BFF participates as the confidential FAPI client and keeps its sender key server-side. Register machine clients separately, with distinct credentials, allowed operations and quotas. Upstream federation and FSP token issuance are separate trust relationships.

## 2. FAPI 2.0 responsibility matrix

The normative baseline is the OpenID Foundation **FAPI 2.0 Security Profile Final**. Choose the supported combinations of client authentication and sender constraint at registration. Initial FSP assumption: private_key_jwt plus DPoP for the BFF, with an mTLS profile added for partner clients as required. Confirm both modes with the deployed implementations. OAuth Rich Authorization Requests (RAR) are an FSP policy for transaction-specific constraints. FAPI Message Signing is a separate profile to adopt where required.

| Owner | Implementation requirements | Release evidence |
|---|---|---|
| Authorization server | Restrict clients to approved asymmetric authentication, validate assertion audience and lifetime and enforce assertion replay policy. Require authenticated PAR for interactive authorization, S256 PKCE, registered redirect URI matching, code reuse rejection and issuer identification in the authorization response. Issue sender-constrained access tokens. Persist ephemeral protocol state across replicas. Govern signing keys and supported algorithms. | OIDF tests for each supported deployment profile. Verify PAR-only authorization, sender binding and key rotation on deployed endpoints. |
| OAuth client or BFF | Authenticate to PAR and token endpoints. Bind code verifier and issuer to the browser login flow, verify returned issuer, protect credentials and create per-request DPoP proofs or use the registered bound certificate. | OIDF client conformance where applicable. Integration tests for redirects, parallel sessions, key and certificate rotation and token refresh. |
| Public resource server at gateway | Validate approved issuer, audience, token type, lifetime and signature or trusted introspection result. Require the registered sender constraint. Enforce endpoint authorization details where possible and pass verified limits for resource-dependent enforcement. | Requests with missing or invalid proof, wrong issuer or audience, stale proof and sender mismatch are rejected before forwarding. |
| Internal APIs | Authenticate workload mTLS and require a short-lived signed, audience-bound internal credential from a dedicated trusted issuer. Verify the operation and target, re-evaluate RBAC and apply business limits. | Direct origin access and forged security context are denied. Service-side authorization holds even when a request arrived over an approved internal network. |

### Sender constraint at the gateway

- **DPoP.** Validate RFC 9449 proof type, signature and public key, access token key thumbprint, method, public target URI, freshness, and the access token hash. Validate nonce when required by the policy and deploy bounded replay detection across replicas. Preserve OAuth/DPoP challenge headers, including nonce where used. Derive the public method and target from trusted proxy information and canonical routing configuration. Validate before path rewriting. Reject a sender-constrained token presented as an ordinary bearer token.
- **mTLS-bound tokens.** Compare the token's certificate binding with the authenticated client certificate. If a load balancer terminates client mTLS, preserve certificate provenance over an authenticated, explicitly trusted hop and strip inbound spoofable forwarding headers. Gateway-to-service mTLS authenticates a different peer and cannot establish the external client's certificate binding.
- **Internal hop.** After successful external validation, the gateway or an internal credential issuer issues a short-lived credential for one destination service. Bind it to the authenticated workload, operation, actor, client, effective tenant, target or canonical request binding as applicable, and approved authorization limits. Strip inbound copies of all identity, tenant and forwarding headers before constructing trusted context. The downstream verifies issuer, audience, expiry, workload binding and request binding. Restrict signer use to the approved issuance path. Avoid replaying the original DPoP proof against a rewritten internal URL.

Maintain an explicit route classification for protected APIs, OAuth protocol endpoints, browser callbacks and provider webhooks. Protocol endpoints enforce their own OAuth flow rules. Provider webhooks have a dedicated verified ingress and workload identity, replay controls and scoped event submission. Management endpoints stay on private operations listeners. Public requests can reach an internal origin only through a route admitted under its corresponding policy.

## 3. Permission aware Spring MVC controllers

### Module layout

| Artifact | Contents |
|---|---|
| fsp-api-contract | Annotations, catalog schema, stable DTO contracts and resource selectors. |
| fsp-web-starter | Internal credential validation, Spring MVC mapping inventory, authorization interceptor, error handling and decision context. |
| fsp-rbac-client | ABIs for authorization, catalog publication and policy revision checks. |
| fsp-plugin-sdk | Manifest schema, plugin scaffolder, scoped core clients and plugin contract test harness. |
| fsp-rbac | Controller and operation catalog, role editor APIs, delegation model, grants and policy decisions. |

### Controller contract

The SDK provides a runtime-retained method annotation. The controller declares the business permission and the resource binding. All other information comes from Spring mappings and the DTO schema. The operation ID remains stable when a URL changes or a new API version is introduced.

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface FspOperation {
    String id();
    String permission();
    ResourceKind resource();
    String resourceVariable();
    OperationRisk risk();
    String title();
}
```

```java
@RestController
@RequestMapping("/v1/tenants/{tenantId}/journal-entries")
public class JournalApprovalController {
    private final JournalApplicationService journals;

    public JournalApprovalController(JournalApplicationService journals) {
        this.journals = journals;
    }

    @PostMapping("/{entryId}/approve")
    @FspOperation(
        id = "journal.entry.approve",
        permission = "je.approve",
        resource = ResourceKind.JOURNAL_ENTRY,
        resourceVariable = "entryId",
        risk = OperationRisk.FOUR_EYES,
        title = "Approve journal entry"
    )
    public ResponseEntity<ApprovalReceipt> approve(
        @PathVariable("tenantId") UUID tenantId,
        @PathVariable("entryId") UUID entryId,
        @RequestHeader("Idempotency-Key") String requestKey,
        @Valid @RequestBody ApproveJournalRequest body,
        @CurrentActor ActorContext actor
    ) {
        return ResponseEntity.accepted().body(
            journals.approve(tenantId, entryId, requestKey, body, actor)
        );
    }
}
```

Here @CurrentActor is an SDK argument resolver backed by an authenticated security context. The caller supplies a tenant path and entry ID as selectors. The service retrieves the journal's authoritative owner and verifies that it matches the tenant and the grant. The application service verifies the approved payload, version, checker identity and relevant token or RAR limits before admitting the operation. A response of 202 means accepted for processing.

### Catalog generation and runtime binding

1. **Inventory** the actual RequestMappingHandlerMapping entries in a CI application context. Resolve merged annotations, class and method paths, HTTP methods, request conditions and API version. Export operation ID, owner component, controller identifier, route templates, permission key, resource type and selector, risk, and DTO schema identifiers. Separate policy entries for OAuth, callbacks and internal health endpoints from protected business handlers.
2. **Validate** explicit HTTP methods, closed resource-selector types, stable names, unique operation IDs for distinct business operations, unambiguous route ownership, known permission namespaces, matching path variables and coverage of every callable handler. Reject ambiguous gateway mappings and unclassified routes. When two API versions expose the same operation, model them as explicit bindings to one catalog identity.
3. **Publish** a signed descriptor with the artifact digest and SDK version from CI. The control plane stages it, computes a permission diff and registers approved catalog entries. It derives OpenAPI operation IDs, x-fsp-permission and x-fsp-resource metadata from the same descriptor.
4. **Activate** only when the runtime inventory matches the staged descriptor and the gateway has the matching route policy. Keep old and new bindings during compatible rolling deployments. A permission rename is a deliberate role migration. A new permission begins with zero grants.
5. **Enforce** through an MVC interceptor after Spring selects the handler and before the controller executes. Resolve the trusted route and path resource selector, evaluate the relevant role grants and tenant and installation constraints, and record a policy decision ID. For resource creation or command-specific body constraints, enforce the complete resource and business check in the application service after typed input validation. Protect scheduled jobs, event consumers and gRPC handlers at the same command boundary.

Return 401 for missing or invalid authentication, 403 for denied authorization, and a consistent concealed-resource 404 policy where required. Return 503 when a mandatory policy dependency is unavailable and the operation cannot be safely admitted. Keep OAuth challenges intact. Use Spring ProblemDetail for application errors, with stable error codes and a correlation ID. Never include raw token, proof or sensitive resource data in errors.

### Role lifecycle without developer wiring

| Step | Result |
|---|---|
| Developer adds an annotated endpoint | An operation and permission appear in the staged catalog automatically. |
| Root approves the capability and delegates its ceiling | Eligible suppliers can use the permission at the allowed tenant, subtree or edge scope. |
| Supplier administrator opens the role editor | The UI shows assignable permissions grouped by component and operation, plus applicability and scope. Role templates may seed a draft. |
| Supplier checker approves the proposed role or assignment | The policy service revalidates the grant and publishes a revision. No code deployment is required. |
| Parent revokes the delegation or the plugin installation | Downstream effective access is invalidated. Existing token scopes cannot rescue a revoked grant. |

Model role permissions, assignments and permission delegations as separate records. A supplier may use its own user-management UI or authorized provisioner to manage identities and submit grants through the core API. Resolve federated identity by issuer and subject and connect it to a canonical person for four-eyes decisions. Role administration checks explicit delegation rights and effective scope on every ancestor edge. A permission to perform an operation gives no implicit delegation authority. High-risk commands recheck current authority at admission using a policy revision or posting fence. Define the cutoff for commands already admitted when revocation occurs.

## 4. Java records for every DTO

Use records for REST requests and responses, plugin commands, catalog descriptors, audit emission inputs, event payloads and repository projections. Use distinct types for each boundary. Keep persistence entities and generated transport representations behind adapters. If protobuf is introduced, use the generated message at the serialization boundary and map to an application record immediately.

```java
public record ApproveJournalRequest(
    @NotNull UUID approvalRequestId,
    @NotNull @PositiveOrZero Long expectedVersion
) {}

public record ApprovalReceipt(
    UUID approvalRequestId,
    UUID journalEntryId,
    String status,
    UUID correlationId
) {}

public record MoneyDto(
    @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
    @NotBlank @Pattern(regexp = "[1-9][0-9]*") String minorUnits
) {}

public record CreateJournalRequest(
    @NotNull LocalDate postingDate,
    @NotEmpty List<@NotNull @Valid JournalLineDto> lines
) {
    public CreateJournalRequest {
        if (lines != null) {
            lines = Collections.unmodifiableList(new ArrayList<>(lines));
        }
    }
}
```

- Use @Valid on the request and nested DTOs. Use nullable boxed fields with @NotNull when omission must differ from zero. Keep field-level validation at the boundary and enforce arithmetic, permissions and posting invariants in the domain.
- Records are shallowly immutable. Copy mutable collections, maps and arrays, including nested mutable values. The illustrated list copy preserves invalid null elements so Bean Validation can report them. Choose a consistent error response for malformed JSON and validation failures.
- Serialize monetary minor units as decimal strings when JavaScript clients must preserve large integers. Parse to a bounded integer type, validate currency against the configured asset registry, and use checked arithmetic. Use Instant for UTC instants and LocalDate for booked dates. Set explicit scale and rounding rules for FX and fees.
- Map request, response and projection records explicitly. Allow-list writable fields. Derive actor, checker, ownership and computed economics from trusted context. Configure strict parsing for high-risk commands and schema compatibility tests for supported clients.
- For partial updates, distinguish absent, explicit null and present value with an explicit patch contract or presence-aware decoder. Use expected version or If-Match for concurrent updates. Query directly into read projections, fetch related data in bounded batches and test query counts for collection endpoints.
- Default record toString includes component values. Keep sensitive records, credentials and whole request bodies out of logs. Use redacted, allow-listed audit projections instead.

## 4A. Searchable controllers and bounded repository queries

Use one typed search contract per collection. Run authorization, tenant and object visibility, filtering, ordering and pagination before returning the page. A controller binds HTTP inputs, an application service applies policy and coordinates reads, and a repository executes a projection with an explicit query budget.

### Controller search and sort contract

`GET /v1/tenants/{tenantId}/journal-entries?q=invoice&status=POSTED&sortBy=postingDate&direction=DESC&page=0&size=25`

| Parameter | Contract |
|---|---|
| `q` | Optional literal text for journal reference and description. Trim and treat blank as omitted. Maximum 100 characters. |
| `status` | Optional closed journal status enum. Unknown status returns 400. |
| `sortBy` | Public field name. Allow `postingDate`, `createdAt` and `reference`. Default `postingDate`. Unknown fields return 400. |
| `direction` | `ASC` or `DESC`. Default `DESC`. |
| `page`, `size` | Zero-based page with a maximum of 1,000, and size 1–100 with a default of 25. Omit totals by default. |

```java
public record JournalSearchParams(
    @Size(max = 100) String q,
    JournalStatus status,
    @Pattern(regexp = "postingDate|createdAt|reference") String sortBy,
    Sort.Direction direction,
    @Min(0) @Max(1_000) Integer page,
    @Min(1) @Max(100) Integer size
) {}

public record JournalSummaryDto(
    UUID entryId, LocalDate postingDate, Instant createdAt,
    String reference, JournalStatus status, String bookCode
) {}

public record JournalSearchResponse(
    List<JournalSummaryDto> items, int page, int size, boolean hasNext
) {
    public JournalSearchResponse {
        items = List.copyOf(items);
    }
}

@GetMapping
@FspOperation(
    id = "journal.entry.search", permission = "je.view",
    resource = ResourceKind.TENANT, resourceVariable = "tenantId",
    risk = OperationRisk.READ, title = "Search journal entries"
)
public JournalSearchResponse search(
    @PathVariable("tenantId") UUID tenantId,
    @Valid @ModelAttribute JournalSearchParams params,
    @CurrentActor ActorContext actor
) {
    return journalSearch.search(actor, tenantId, params);
}
```

Place the method on a controller with the journal collection mapping and an injected search service. Bind the record through constructor binding. The SDK risk and resource enum names illustrate the contract. Define public sort names independently of persistence names. Parse the allow-listed field into a typed internal sort key, then map that key to a fixed SQL column or JPA expression. Bind filter values as parameters. For literal LIKE search, escape the escape character, percent and underscore and declare the escape character in SQL. Keep public validation narrow and return the existing ProblemDetail contract for invalid fields, directions or bounds.

### Service and repository responsibilities

```java
@Transactional(readOnly = true)
public JournalSearchResponse search(
    ActorContext actor, UUID tenantId, JournalSearchParams params
) {
    JournalVisibility visibility = access.requireJournalView(actor, tenantId);
    JournalSearchSpec spec = JournalSearchSpec.from(params);
    List<JournalSummaryDto> rows = queries.findSummaries(visibility, spec);
    boolean hasNext = rows.size() > spec.size();
    int end = Math.min(rows.size(), spec.size());
    return new JournalSearchResponse(
        rows.subList(0, end), spec.page(), spec.size(), hasNext
    );
}
```

Use an immutable internal search spec with defaults, normalized text, a closed sort key and bounded offset arithmetic. The repository accepts the authorized visibility scope, including allowed books or installation where applicable. Apply the scope predicate in the database. A row-by-row authorization check after pagination would produce incomplete pages and could expose hidden rows through totals.

For the summary endpoint, run **one data query** for `size + 1` rows. Select only required columns, join the to-one book association on both book and tenant, and construct the record directly using a JPA constructor projection or a JDBC row mapper. Apply tenant and authorized book predicates, followed by optional status and text predicates. For the default sort use `ORDER BY posting_date DESC, entry_id DESC`. For a nullable sortable field such as reference, define null placement explicitly and always append the unique entry ID. Index supported access paths, starting with the tenant and default ordering, then verify query plans with representative data. Broad substring search may need a dedicated text index. Use an explicit count query only when clients need exact totals and apply the same visibility and filter predicates to it.

When the response includes a to-many collection, first page the parent summaries and remove the lookahead row. Then load child records with **one batched query** using the authorized scope and retained parent IDs. Group the records by parent ID and preserve parent and child ordering in the response. Skip the child query when the page is empty. For filtering by a child attribute, use an EXISTS predicate or another query shape that yields one row per parent before pagination.

| Read shape | Data-query budget per request |
|---|---|
| Summary slice with to-one data | 1 projection query |
| Summary slice with one to-many collection | At most 2 queries |
| Slice with one to-many collection and exact total | At most 3 queries |

These budgets cover application data reads. Track authorization and other infrastructure queries separately and ensure their counts also stay independent of page size. Use a single database snapshot for multi-query responses where parent and child data must reflect the same state. The budgets assume all retained IDs fit in one bounded batch.

### Prevent N+1 in reviews and tests

- Keep entity traversal and query selection inside the transaction. Disable Open Session in View with `spring.jpa.open-in-view=false` and return records to the controller. A response serializer should issue zero SQL queries.
- Fetch required data explicitly. Use to-one joins or projections for scalar fields. Avoid paginating a collection fetch join. Reject repository lookups inside per-row mappers and nested service calls that fetch once per result. Hibernate batch fetching can mitigate legacy paths while explicit projections and batched reads define the endpoint's query budget.
- Test with a real database and cleared persistence context. Count statements across the complete HTTP request, including serialization, with multiple non-empty page sizes and seeded rows that have distinct associated records. Check empty pages, multiple children, equal sort values, null references, unauthorized books and foreign tenants, invalid sort fields, and literal search characters.
- For deep lists, add a versioned opaque cursor with integrity protection. Bind it to tenant, filter, sort and direction and reauthorize on every request. Seek using the last ordered value and entry ID. Define null handling for each supported sort or keep cursor sorts to non-nullable fields. A stable order breaks ties. A fixed snapshot or immutable ordering is a separate requirement if concurrent edits must leave the traversal unchanged.

[Spring Data JPA query methods and stable keyset ordering](https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html) · [Hibernate ORM guide to fetching and N+1](https://docs.hibernate.org/stable/orm/introduction/html_single/)

## 5. Independently built plugins

Ship each plugin as a separately versioned OCI image running its own Spring Boot application. Use the same starter and contracts as core HTTP APIs. Give the plugin its own build pipeline, service identity, route ownership and data access. Use wire-level contracts for compatibility. In-process loading would share the host process trust boundary and is outside this reference design.

| Stage | What happens |
|---|---|
| Build | Plugin imports the FSP SDK BOM, exposes annotated controllers and tests resource enforcement. Build exports manifest, operation catalog, OpenAPI and event schemas. Sign image and descriptors and record the digest. |
| Register | Platform verifies provenance and the SDK compatibility range. It checks namespace and route ownership, dependency graph, event grants and requested core capabilities. |
| Install | Four-eyes approves a tenant installation and binds instance ID, digest, credential path, entitlement and inheritance origin. Provision GL templates and posting rules through core. Publish routes once runtime, catalog and dependencies agree. |
| Invoke | Gateway admits only the registered route. Plugin authorizes actor, tenant, resource and installation. For shared plugin deployments, data policies and credentials remain installation-scoped. SDK core clients submit intents using the plugin workload identity and approved delegation context. |
| Upgrade or revoke | Apply compatible schema migrations in phases, keep a rollback target, and recheck manifest diffs. Revocation blocks new calls and subscriptions, drains or fences in-flight commands under policy, and revokes secret access. |

Keep tenant plus installation in storage keys and enforce both at the database. Use least-privilege DB roles subject to RLS and set installation and tenant context transaction-locally from verified authorization. Partition credentials by installation and access them through scoped secret APIs. Core re-authorizes every financial intent and builds the posting plan. Plugins never receive TigerBeetle access. For events, authenticate producer and consumer identity, verify installation entitlements, apply schema validation, deduplicate deliveries and manage separate handler identities without inventing a human actor.

## 6. Gateway abuse controls and private container topology

| Layer | Enforce | Failure behavior |
|---|---|---|
| Managed public edge | Volumetric DDoS protection, WAF, TLS policy, connection and handshake budgets, trusted proxy controls and coarse source limits | Shed traffic before it consumes application resources. |
| Gateway pre-authentication | Explicit host, method and route inventory, consistent path handling, bounded headers and bodies, streaming size limits, timeout limits and coarse route and IP quotas | Unknown routes never reach an origin. Reject malformed requests and oversized payloads locally. |
| Gateway post-authentication | Token buckets per verified client, tenant and route, plus concurrency caps and expensive-operation budgets. Isolate administrative, login and payment capacity. | Return 429 for quota violations with Retry-After where meaningful. Apply bounded shedding and 503 for unavailable capacity or mandatory dependencies. |
| Service | Bounded pools and queues, deadline propagation, separate worker budgets, and protection for slow DB or downstream calls | Shed early. Retry only when the command's idempotency and outcome resolution support it. |
| Network | Only edge and gateway publish public endpoints. On Docker, leave core container ports unpublished and separate gateway, application and data networks. On Kubernetes use private Services, default-deny policies supported by the CNI, explicit ingress and egress, and workload mTLS where required. | Unauthorized callers cannot reach business listeners or establish a trusted application session. |

Use Spring Cloud Gateway WebFlux RequestRateLimiter with Redis for distributed token buckets if the project selects WebFlux. Derive post-authentication keys from verified identity, never raw tenant headers. Bound key cardinality and define behavior on quota-store loss. A sensitive route should fail closed or use an explicitly approved conservative emergency limit. Verify filter order by integration testing. Implement or select sender-proof enforcement for the **actual** gateway stack. The existence of Spring Security servlet DPoP support does not establish feature parity for a reactive gateway.

Use an explicit gateway route set generated from approved descriptors. Disable automatic service-discovery exposure and catch-all forwarding. Apply the same admission discipline to PAR, token and login endpoints. Track rejection rates, quota saturation, queue depth, authentication latency and legitimate traffic goodput while load testing. Define peak throughput, acceptable latency, fairness between tenants and recovery targets before asserting a DDoS resilience objective.

### Example route policy generated from the catalog

This is the proposed FSP control-plane schema. The gateway adapter compiles it into the deployed route and attaches the approved filters. The application descriptor supplies the operation and route. Platform policy supplies the audience, sender mode, forwarding target and budgets.

```yaml
operationId: journal.entry.approve
match:
  method: POST
  path: /v1/tenants/{tenantId}/journal-entries/{entryId}/approve
admission:
  profile: fapi2-dpop
  audience: fsp-financial-api
  authorizationDetailsType: journal_approval
  maxBodyBytes: 16384
  quotaPolicy: financial-write
  concurrencyPolicy: journal-approval
forward:
  service: journal-service
  audience: fsp-internal-journal
  workloadMtls: required
```

For this example the authorization server defines the journal_approval authorization-details schema and checks consent, client allowlists and tenant bounds before granting it. At ingress the gateway checks that the granted operation and tenant cover the route. The journal service verifies the entry's actual owner and the current checker grant. If a profile authorizes a particular entry or amount, the service checks the canonical resource or financial intent against that same grant. An approved token, a valid role and a matching approval are independently required wherever the operation policy requires all three.

## 7. Audit evidence and sensitive operations

Write authoritative audit evidence at core enforcement and mutation boundaries. Gateway and plugin logs add context. Ordinary access logging, security decision logging and durable mutation evidence have distinct retention and availability policies.

| Event | Required evidence |
|---|---|
| Request admission or denial | Correlation ID, request ID, stable operation ID, verified client and actor when available, tenant and installation when established, decision, reason category and policy revision. |
| Catalog, role or entitlement change | Artifact digest, old and new schema or policy versions, before and after hashes, actor, checker, delegation scope, and effective time. |
| Maker-checker decision | Canonical payload hash, target version, distinct canonical person IDs, decision, reason, change diff reference, time and approval ID. Recheck execution-time permissions and approved data. |
| Journal posting or external action | Approval or policy reference, idempotency reference, economic event and posting plan hashes, TigerBeetle IDs or provider reference, outcome, and recovery history. |

Use a transactional outbox for OLGP mutations. Before TigerBeetle submission, persist the approved plan and exact transfer IDs. When commit is confirmed, finalize the journal, outcome evidence and outbox idempotently. Verify an uncertain commit before allowing a new ledger attempt. Maintain append-only evidence, canonical hash encoding, ordered per-tenant chain checkpoints, signed roots and immutable archive retention. Store only identifiers and approved claims in audit records. Keep raw credentials, DPoP proofs, tokens, bank data and KYC payloads out of logs. Rate-limit or aggregate unauthenticated denial telemetry so it cannot overwhelm durable financial evidence.

## 8. Build sequence and acceptance

| Stage | Demonstration |
|---|---|
| 1. Identity and ingress | One confidential BFF uses authenticated PAR and S256 PKCE, obtains a DPoP-bound token and reaches one protected service through the gateway. Wrong issuer, audience and sender proof fail at ingress. A direct origin call fails. |
| 2. Controller catalog and delegated RBAC | Publish two controller permissions from annotations, display them in the role UI, delegate one to a supplier, and assign it through maker-checker. Test object ownership, sibling isolation, self-approval and revocation across replicas. |
| 3. Record DTOs and audit | Validate nested payloads, money precision, stale versions and partial update presence. Trace a failed authorization and an approved command through a stable operation ID and durable evidence. |
| 4. Independent plugin | Build and install a separately versioned plugin for one child tenant. Demonstrate live entitlement checks, installation isolation, permission diffs, safe upgrades and a core-authorized ledger intent. |
| 5. Production gate | Run OIDF conformance tests for selected profiles, ingress and workload identity tests, revocation and commit recovery tests, gateway overload tests and audit checkpoint verification. Record versions, topology, configurations and test evidence. |

Release gates include tests for undeclared controller methods, mismatched catalog digests, renamed permissions, direct service access, revoked ancestor grants, tenant mismatches, duplicate proofs across replicas, dependency failure, and sensitive data redaction. Run conformance against the complete externally reachable deployment, including edge and certificate termination where relevant. Certification claims should identify the certified component, profile and tested deployment scope.

## References

1. [OpenID Foundation FAPI 2.0 Security Profile Final](https://openid.net/specs/fapi-security-profile-2_0-final.html)
2. [OpenID Foundation final conformance tests](https://openid.net/fapi2-0-final-conformance-tests-available/)
3. [RFC 9449 OAuth 2.0 Demonstrating Proof of Possession](https://www.rfc-editor.org/rfc/rfc9449)
4. [RFC 8705 OAuth 2.0 Mutual TLS Client Authentication and Certificate Bound Access Tokens](https://www.rfc-editor.org/rfc/rfc8705)
5. [RFC 9396 OAuth 2.0 Rich Authorization Requests](https://www.rfc-editor.org/rfc/rfc9396)
6. [Spring Boot 4.0 system requirements](https://docs.spring.io/spring-boot/4.0/system-requirements.html) and [Spring Cloud release trains](https://spring.io/projects/spring-cloud/)
7. [Spring Security resource server DPoP](https://docs.spring.io/spring-security/reference/7.0/servlet/oauth2/resource-server/dpop-tokens.html) and [authorization server protocol endpoints](https://docs.spring.io/spring-security/reference/7.0/servlet/oauth2/authorization-server/protocol-endpoints.html). Use the documentation branch for the exact pinned runtime when implementing.
8. [Spring Cloud Gateway WebFlux RequestRateLimiter](https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway-server-webflux/gatewayfilter-factories/requestratelimiter-factory.html)
9. [Kubernetes Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
