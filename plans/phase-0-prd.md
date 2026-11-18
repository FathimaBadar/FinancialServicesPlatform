# FSP Phase-0 PRD — Core Walking Skeleton (PSP Vertical Foundation)

## 1. Goal

Build the thinnest end-to-end vertical slice of the FSP platform that exercises every core primitive needed for the PSP vertical. By the end of Phase-0:

- A **Platform Admin** creates a **PSP tenant**.
- The **PSP Admin** seeds the PSP **Chart of Accounts**.
- The **PSP Admin** onboards a **supply-chain tenant** (manufacturer, distributor/dealer, wholesaler, or merchant) through a single KYC-driven flow.
- The **Applicant Admin** fills the five-tab KYC application.
- A **second PSP Admin / TPTS Operator** reviews the KYC (IDENTITY + SANCTIONS checks) and approves the tenant.
- The tenant becomes **ACTIVE**, books are provisioned, and the first admin receives activation credentials.
- The **Tenant Admin** creates a balanced manual **Journal Entry (JE)**.
- A **second Tenant Admin** approves the JE.
- The JE posts end-to-end through TigerBeetle.
- A simulated crash-after-commit resolves cleanly through the uncertain-commit recovery flow.
- The full chain is visible in the **audit log**.

This phase is intentionally boring. It proves the money-movement engine, RBAC, four-eyes, audit, and recovery all work together before any PSP business logic is added.

---

## 2. Actors (mapped from MiPay SME project)

| FSP actor | SME equivalent | What they do in Phase-0 |
|---|---|---|
| **PLATFORM_ADMIN** | MindLabs admin | Bootstraps the system, creates the PSP tenant, seeds permissions/roles, KYC master data, and bank/branch/MCC reference data. |
| **PSP_ADMIN** | TPTS ops / PSP operator | Runs the PSP tenant; onboards supply-chain tenants through KYC; acts as checker for sensitive operations. |
| **TPTS_OPS** | TPTS ops | Reviews and approves/rejects KYC applications; performs second-person approvals where needed. |
| **APPLICANT_ADMIN** | First admin created during onboarding | Fills the KYC application while their org is `PENDING`; becomes full tenant admin after activation. |
| **TENANT_ADMIN** | Organization owner/admin | Operates an activated tenant; creates manual JEs; manages their own books and accounts. |
| **TENANT_CHECKER** | Second organization officer | Approves tenant-level sensitive operations (JEs) when four-eyes is required. |

### Actor boundaries in Phase-0

| Action | Maker | Checker | Notes |
|---|---|---|---|
| Create PSP tenant | PLATFORM_ADMIN | PLATFORM_ADMIN (can self-approve bootstrap) | Only at root bootstrap. |
| Seed PSP CoA | PSP_ADMIN | PSP_ADMIN (can self-approve bootstrap) | Only when PSP tenant has no accounts. |
| Onboard supply-chain tenant | PSP_ADMIN or self-registration | PSP_ADMIN or TPTS_OPS (different `person_id`) | Single KYC-driven flow creates tenant + admin + KYC case. |
| Activate tenant after KYC | System submits on KYC approval | PSP_ADMIN / TPTS_OPS approves KYC | Activation is gated by `KYC status = APPROVED`. |
| Create GL account in PSP book | PSP_ADMIN | PSP_ADMIN (different `person_id`) | Four-eyes. |
| Create GL account in tenant book | TENANT_ADMIN | TENANT_CHECKER or PSP_ADMIN | Four-eyes. |
| Create and submit manual JE | TENANT_ADMIN | TENANT_CHECKER or PSP_ADMIN | Four-eyes; enforced at `person_id`. |
| Activate period / close period | PSP_ADMIN | PSP_ADMIN (different `person_id`) | Four-eyes. |
| Change settlement bank account | TENANT_ADMIN | TENANT_CHECKER or PSP_ADMIN / TPTS_OPS | Re-triggers sanctions screening. |

---

## 3. Scope Inclusions

### 3.1 Core services

| Service | Responsibility |
|---|---|
| `fsp-core` | RBAC, org lifecycle, books/CoA, JE engine, posting recovery, audit, event outbox, TigerBeetle client. |
| `fsp-bff` | Browser session cookie, login/logout, `/session`, proxies to core with internal credential. |
| `fsp-spa` | React SPA with design system, shell, and role-scoped screens. |
| TigerBeetle | Ledger accounts and transfers. |
| PostgreSQL | OLTP/OLGP data: tenants, users, roles, grants, books, accounts, JEs, approvals, audit, outbox. |

### 3.2 Authentication and session

- Confidential BFF pattern; browser holds only a session cookie.
- Simplified login for Phase-0: username/password against a local identity store, with seeded Platform Admin and PSP Admin users.
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, scoped to BFF.
- SPA route guards call `GET /bff/session`.
- Full FAPI 2.0 (PAR/PKCE/DPoP/mTLS) is out of scope for Phase-0; migration path documented.

### 3.3 RBAC and four-eyes

- Permission catalog seeded at boot:
  - `platform.bootstrap`
  - `org.create`
  - `org.activate`
  - `org.onboard_child`
  - `org.approve_child`
  - `gl.account.create`
  - `gl.account.approve`
  - `je.create`
  - `je.approve`
  - `je.view`
  - `audit.view`
  - `role.manage`
  - `user.manage`
  - `kyc.review`, `kyc.approve`, `kyc.reject`
- `screening.run` (simulated IDENTITY + SANCTIONS)
- `bank.account.create`, `bank.account.approve`
- `period.open`, `period.close`
- Roles seeded:
  - `PLATFORM_ADMIN` — all platform-scoped permissions; seeds KYC master data.
  - `PSP_ADMIN` — PSP tenant + child onboarding + checker permissions.
  - `TPTS_OPS` — KYC review and approval; second-person approvals.
  - `APPLICANT_ADMIN` — limited to own KYC application endpoints while org is `PENDING`.
  - `TENANT_ADMIN` — create JEs, view own book, request bank account changes.
  - `TENANT_CHECKER` — approve JEs and bank account changes in tenant book.
- Scope model: `PLATFORM`, `TENANT`, `SUBTREE`, `EDGE`.
- Four-eyes enforced at `person_id`: a maker cannot approve their own request.
- Approval request aggregate: `ApprovalRequest { id, tenantId, operationType, targetResourceId, payloadHash, makerId, checkerId, status, reason, requestedAt, decidedAt, version }`.

### 3.4 Organization model (minimal)

- Tenant: `tenantId`, `parentTenantId`, `hierarchyPath`, `depth`, `type={PLATFORM,PSP,TENANT}`, `subType={MANUFACTURER,DISTRIBUTOR,DEALER,WHOLESALER,MERCHANT}`, `status={PENDING,ACTIVE,SUSPENDED,DEACTIVATED}`, `verificationStatus={PENDING,VERIFIED,REJECTED}`, `createdBy`, `activatedBy`, `version`.
- Max depth: 2 for Phase-0 (platform root depth 0, PSP depth 1, onboarded tenant depth 2).
- A tenant sees only its own subtree.
- Tenant activation is gated by KYC case status = `APPROVED`.
- KYC is live from the moment onboarding begins; a rejected KYC leaves the tenant `REJECTED` and the applicant cannot trade or sign in to non-KYC endpoints.
- Soft-deactivation sets posting fence; hard deactivation is out of scope.

### 3.5 Chart of Accounts and books

- Book: `bookId`, `tenantId`, `legalEntityId`, `currency`, `ledgerId`, `status`.
- One PSP book per PSP tenant; one merchant book per merchant tenant.
- Default ledger topology: shared TigerBeetle ledger per currency (ISO 4217 numeric ledger ID).
- GL account model: `glAccountId`, `bookId`, `tenantId`, `parentGlAccountId`, `tigerBeetleAccountId`, `ledgerId`, `code`, `name`, `accountType`, `normalBalance`, `balanceBound`, `postingAllowed`, `currency`, `status`, `createdBy`, `approvedBy`, `version`.
- PSP CoA template (Phase-0 subset):
  - `1300 Acquirer Clearing`
  - `2100 Merchant Payable`
  - `2200 Chargeback Payable`
  - `1150 Merchant Reserve`
  - `2110 Payouts in Transit`
  - `1350 Network Fees Payable`
  - `4100 MDR Revenue`
  - `5100 Interchange Expense`
  - `5200 Scheme Fee Expense`
  - `1000 Cash at Bank`
- Merchant CoA template (Phase-0 subset):
  - `2000 Customer Deposits`
  - `1000 Cash at Bank`
  - `4000 Fee Revenue`
- Account creation is four-eyes and uses the provisioning recovery model: persist plan, submit to TB, confirm, then mark `ACTIVE`.
- Account ID: `UUIDv5(platformNamespace, bookId + ":" + glAccountId)`.

### 3.6 Journal Entry and posting engine

- JournalEntry: `entryId`, `tenantId`, `bookId`, `periodId`, `entryType=MANUAL`, `postingDate`, `valueDate`, `description`, `reference`, `currency`, `lines[]`, `totalDebits`, `totalCredits`, `status`, `planHash`, `tbTransferIds[]`, `makerId`, `checkerId`, `finalizedAt`, `version`.
- JournalLine: `lineNo`, `glAccountId`, `tigerBeetleAccountId`, `direction={DEBIT,CREDIT}`, `amount`, `memo`.
- Balanced by construction: sum of debits equals sum of credits per book and currency.
- **Direct debit-to-credit matching** (not star): stable sort debits then credits; pair min remainders; link all transfers except the final one.
- Deterministic transfer IDs from `(entryId, legIndex)`.
- Posting state machine:
  ```
  DRAFT -> PENDING_CHECKER -> READY -> SUBMITTING -> COMMITTED -> FINALIZED
                                    \-> COMMIT_UNKNOWN -> (recovery) -> COMMITTED | REJECTED
                                    \-> REJECTED
  ```
- Canonical posting plan persisted before submission.
- Uncertain commit recovery via `lookup_transfers` with original IDs; no fresh IDs until outcome is definitive.
- Idempotency key scoped to `(tenantId, operationId, idempotencyKey)` bound to canonical request hash.
- Atomic finalization in OLGP: journal status, audit record, outbox event.

### 3.7 TigerBeetle integration

- Single-node TB cluster for Phase-0.
- TB accounts carry `user_data_128=glAccountId`, `user_data_64=tenantHash`, `user_data_32=accountTypeOrdinal`.
- TB transfers use `flags.linked` except the final transfer in a request.
- Read paths: `getBalance`, `getAccountBalances`.

### 3.8 Audit and events

- Audit record: `actorId`, `checkerId`, `tenantId`, `bookId`, `actionType`, `resourceType`, `resourceId`, `beforeStateHash`, `afterStateHash`, `correlationId`, `ipAddress`, `clientId`, `timestampUtc`.
- Transactional outbox for mutations.
- Core events (Phase-0): `Organization.Onboarded`, `Organization.Activated`, `GLAccount.Created`, `GLAccount.Activated`, `Approval.Requested`, `Approval.Granted`, `Approval.Rejected`, `JournalEntry.Drafted`, `JournalEntry.Submitted`, `JournalEntry.Posted`, `JournalEntry.Rejected`, `PostingGroup.Committed`, `PostingGroup.Finalized`, `PostingGroup.CommitUnknown`.

### 3.9 Accounting periods

- Period: `periodId`, `tenantId`, `bookId`, `fiscalYear`, `periodNo`, `startDate`, `endDate`, `status={OPEN,SOFT_CLOSED,HARD_CLOSED}`.
- One open period per book at a time.
- Period close is four-eyes; posting fence blocks new admissions during close.
- Soft/hard close distinctions simplified in Phase-0; mainly `OPEN` vs `CLOSED`.

### 3.10 KYC / Onboarding (new core capability in Phase-0)

A tenant onboarding implies a live KYC case. The KYC subsystem is **core-scoped** in Phase-0 (not a plugin), because org activation depends on it. It is built provider-agnostically so it can be extracted to a plugin later.

#### 3.10.1 KYC case model

```
KycCase {
  caseId: uuid
  tenantId: uuid
  caseType: PERSONAL | BUSINESS
  status: PENDING_REVIEW | APPROVED | REJECTED | REQUEST_INFO
  submittedAt: timestamp
  decidedAt: timestamp|null
  reviewerId: principal_id|null
  rejectionReason: string|null
  riskRating: LOW | MEDIUM | HIGH
  nextReviewDate: date|null
  version: int
}
```

Screening checks stored separately:

```
ScreeningCheck {
  checkId: uuid
  caseId: uuid
  tenantId: uuid
  checkType: IDENTITY | SANCTIONS | ADVERSE_MEDIA | PEP
  result: PASS | FAIL | MANUAL_REVIEW
  details: string
  checkedAt: timestamp
  simulated: boolean
}
```

#### 3.10.2 Five-tab KYC data capture

The onboarding form follows the SME `kyc-filed.md` structure exactly:

**Tab 1 — Business Profile & General Information**
- Legal Business Name
- DBA / Trading Name
- Entity Type / Legal Structure (Sole Proprietorship, Partnership, Private Limited / LLC, Public Corporation, Trust/NGO)
- Business Registration / Corporate ID Number
- Date of Incorporation / Establishment
- Tax Identification Number (TIN / EIN / GSTIN / VAT ID)

**Tab 2 — Operational & Store Details**
- Merchant Category Code (MCC) / Industry Vertical
- Website URL / Mobile App Link / Storefront Details
- Expected Monthly Processing Volume
- Average Ticket Size / Transaction Value

**Tab 3 — Registered & Operational Address**
- Registered Office Address (Street, City, State/Province, Postal Code, Country)
- Operational / Store Address (same fields if different)

**Tab 4 — Ultimate Beneficial Owners (UBO) & Key Management**
One or more persons:
- Full Legal Name
- Date of Birth (DOB) & Nationality
- Residential Address
- Phone Number
- Email Address
- Government-Issued Identification Details: Document Type, ID Number, Expiry Date
- Ownership Percentage
- Politically Exposed Person (PEP) Declaration (Yes/No)

Person 1 is the **Applicant Admin**. Their email receives the activation link once KYC is approved. Their username is generated from the Legal Business Name + optional Registration Number, as per SME `UsernamePolicy`.

**Tab 5 — Settlement & Payout Bank Account Details**
One or more accounts:
- Beneficiary / Account Holder Name
- Bank Name & Branch / Institution Code
- Account Number / IBAN
- Account Type (Checking / Current vs Savings)

#### 3.10.3 Namibian validation rules

From `response1.md`:
- BIPA registration number: `^([A-Z]{2})?\d{3,10}$`; normalize by stripping spaces, dots, hyphens, slashes and uppercasing.
- NamRA TIN: `^\d{8}$`.
- Bank branch code: `^\d{5,6}$`.
- Beneficial ownership threshold: ≥ 25% ownership or voting rights.
- Record retention: at least 5 years from relationship end / transaction date.
- Monthly processing volume is internal risk appetite only, not statutory.

#### 3.10.4 Screening and decision

- `IDENTITY` check: validates captured identity data; simulated PASS/MANUAL_REVIEW/FAIL.
- `SANCTIONS` check: simulated provider; FAIL blocks approval.
- Risk rating rules (from SME):
  - Cash-heavy / gambling / forex → HIGH (12 months)
  - Sanctions MANUAL_REVIEW → HIGH (12 months)
  - Blank business type → MEDIUM (24 months)
  - Default retail/service → LOW (36 months)
  - Supplier tiers default → MEDIUM (24 months)
- Approval records both checks, rating, review cycle, and is four-eyes when required.
- A rejected KYC archives the applicant and blocks sign-in.
- A bank account change is a trigger event that re-opens sanctions screening.

#### 3.10.5 Onboarding transaction

Onboarding is a single atomic action:

1. PSP Admin selects tenant subtype (manufacturer, distributor, dealer, wholesaler, merchant) and fills/submits the five-tab KYC document.
2. In one transaction, the system creates:
   - the tenant (`status=PENDING`, `verificationStatus=PENDING`)
   - the first admin user (`APPLICANT_ADMIN` role, bound to pending tenant, username generated)
   - the KYC case (`status=PENDING_REVIEW`)
   - the screening checks (simulated)
   - the books for that tenant (suspended until activation)
3. If anything is refused, everything rolls back.

#### 3.10.6 Activation flow

1. TPTS Ops / PSP Admin opens the KYC review panel.
2. Panel shows captured data, IDENTITY and SANCTIONS checks, risk signals.
3. Reviewer approves or rejects with reason.
4. On approval:
   - KYC case → `APPROVED`
   - Tenant → `ACTIVE`, `verificationStatus=VERIFIED`
   - Books → `ACTIVE`
   - CoA template is provisioned automatically
   - Activation link is sent to Applicant Admin email
   - Audit records the decision

#### 3.10.7 KYC master data

Seeded by PLATFORM_ADMIN at bootstrap:
- Business types / entity structures
- MCC / industry verticals
- Bank list with branch codes
- Country list
- Document types
- Screening result types

---

## 4. Out of Scope

| Capability | Phase-0 | Future slice |
|---|---|---|
| Real document upload / OCR / liveness | No | KYC plugin hardening |
| PEP / adverse-media provider integration | Simulated only | KYC plugin hardening |
| Extract KYC to a separate plugin | No | Slice 1 plugin refactor |
| PSP payment flows (auth, capture, network costs, payout) | No | Slice 2 |
| Plugin SDK/host beyond readiness skeleton | No | Slice 1 |
| Multi-currency / FX | Single currency | Slice 3 |
| Inter-org transfers / `PostingGroup` multi-book | Single-book JEs only | Slice 4 |
| Deep hierarchy / reparenting | Max depth 2 | Slice 5 |
| Full FAPI 2.0 (PAR/PKCE/DPoP/mTLS) | Simplified session | Hardening slice |
| External IdPs | Local identity store | Slice 1+ |
| Trial balance / financial statements | Balance endpoint only | Slice 3 |
| Notifications / email / SMS | Simulated / logged only | Slice 2+ |
| Bank connectors | No | Slice 2+ |

---

## 5. Feature-by-Feature Breakdown

### Feature 0: Bootstrap and KYC master data

#### BE
- Seed Platform Admin on first run.
- Seed KYC master data: business types, MCC codes, bank list with branch codes, countries, document types.
- Seed reference validation rules for Namibia (BIPA number, TIN, branch code).

#### FE
- No dedicated UI; used by onboarding forms.

---

### Feature 1: Bootstrap and login

#### BE
- Seed Platform Admin on first run.
- `/bff/auth/login` validates username/password, creates session, sets HttpOnly cookie.
- `/bff/session` returns `{ authenticated, expiresAt, user { id, name, roles[], activeTenantId } }`.
- `/bff/auth/logout` clears session and cookie.

#### FE
- Login page with username/password.
- Route guard: redirects to login on `401`.
- Dashboard shell with actor-specific navigation.

---

### Feature 2: KYC-driven tenant onboarding

#### BE
- `POST /v1/tenants/with-kyc` — single-transaction onboarding:
  - Creates tenant (`status=PENDING`, `verificationStatus=PENDING`, subtype = manufacturer/distributor/dealer/wholesaler/merchant).
  - Creates first admin user (`APPLICANT_ADMIN`) with username generated from Legal Business Name + Registration Number.
  - Creates KYC case (`status=PENDING_REVIEW`) with all five tabs.
  - Creates screening checks (simulated IDENTITY + SANCTIONS).
  - Creates tenant books (suspended until activation).
- `GET /v1/tenants/{tenantId}/kyc` — KYC case + captured data.
- `GET /v1/tenants/{tenantId}/kyc/checks` — screening checks.
- `POST /v1/tenants/{tenantId}/kyc/approve` — TPTS_OPS / PSP_ADMIN approves (four-eyes where required).
- `POST /v1/tenants/{tenantId}/kyc/reject` — reject with reason.
- `POST /v1/tenants/{tenantId}/kyc/request-info` — request more information.
- On approval: tenant → ACTIVE, books → ACTIVE, CoA template provisioned, activation link sent (simulated).
- On rejection: applicant archived, cannot sign in.

#### FE
- **Onboarding form** (five tabs, wizard-style):
  - Tab 1: Business Profile
  - Tab 2: Operational Details
  - Tab 3: Addresses
  - Tab 4: UBOs & Key Management (Person 1 = applicant admin)
  - Tab 5: Settlement Bank Accounts
- Field-level validation for Namibian formats.
- "Submit for review" action.
- **KYC review panel** for PSP Admin / TPTS Ops:
  - Shows captured data, screening checks (PASS/FAIL/MANUAL_REVIEW chips), risk signals.
  - Approve / Reject / Request Info actions with reason field.
- **Applicant status page** for pending admin.

---

### Feature 3: Tenant/organization administration

#### BE
- `POST /v1/tenants` — create PSP tenant (used for root PSP only).
- `GET /v1/tenants/{tenantId}`.
- `POST /v1/tenants/{tenantId}/activate` — retained for direct activation edge cases; normal path is via KYC approval.
- `GET /v1/tenants/{tenantId}/children`.
- Tenant status transitions and hierarchy path.

#### FE
- Platform Admin: "Create PSP" form.
- PSP Admin: tenant directory grouped by subtype (Manufacturer / Distributor / Dealer / Wholesaler / Merchant).
- PSP Admin: create onboarded tenant via KYC wizard.
- Tenant detail page showing status, KYC outcome, CoA.

---

### Feature 4: RBAC and role assignment

#### BE
- `GET /v1/permissions`.
- `GET /v1/tenants/{tenantId}/roles`.
- `POST /v1/tenants/{tenantId}/roles/{roleId}/assignments`.
- `GET /v1/tenants/{tenantId}/principals/{principalId}/effective-permissions`.
- Internal enforcement at write boundaries.

#### FE
- Role assignment page per tenant.
- Permission-denied states with exact missing permission.
- Effective-permission debug view for admins.

---

### Feature 4: Four-eyes approval requests

#### BE
- `POST /v1/approvals` — create approval request for a target operation.
- `POST /v1/approvals/{approvalId}/approve` — checker action; rejects if maker==checker.
- `POST /v1/approvals/{approvalId}/reject` — checker action with reason.
- `GET /v1/approvals?status=...&scope=...`.
- Approval executes the target operation atomically on grant.

#### FE
- Approval queue (`ApprovalQueue` organism) for checkers.
- Approval detail / diff dialog (`ApprovalDiffDialog`).
- Maker surface shows "awaiting checker" with reference.

---

### Feature 5: Chart of accounts and book provisioning

#### BE
- `POST /v1/tenants/{tenantId}/books` — create book (used internally by tenant provisioning).
- `POST /v1/tenants/{tenantId}/books/{bookId}/provision-default-coa` — seed template.
- `POST /v1/tenants/{tenantId}/books/{bookId}/gl-accounts` — create account (four-eyes).
- `GET /v1/tenants/{tenantId}/books/{bookId}/gl-accounts`.
- `GET /v1/tenants/{tenantId}/books/{bookId}/gl-accounts/{glAccountId}`.
- `GET /v1/tenants/{tenantId}/books/{bookId}/gl-accounts/{glAccountId}/balance`.

#### FE
- CoA tree (`CoATree` organism).
- GL account create form with `AccountPicker` and four-eyes notice.
- GL account detail with balance.

---

### Feature 6: Journal entry engine

#### BE
- `POST /v1/tenants/{tenantId}/journal-entries` — create draft.
- `GET /v1/tenants/{tenantId}/journal-entries` — search/list.
- `GET /v1/tenants/{tenantId}/journal-entries/{entryId}`.
- `POST /v1/tenants/{tenantId}/journal-entries/{entryId}/submit-for-approval`.
- `POST /v1/tenants/{tenantId}/journal-entries/{entryId}/approve` — checker; four-eyes.
- `POST /v1/tenants/{tenantId}/journal-entries/{entryId}/check-status` — recovery for `COMMIT_UNKNOWN`.
- Direct debit-to-credit matching module with property tests.
- Uncertain-commit recovery harness.

#### FE
- Journal entry list (`JournalEntryTable`).
- Journal entry detail with `PostingStateTimeline`.
- Create JE form with multi-line editor, `AmountInput`, `AccountPicker`.
- Checker approval surface.
- `UncertainPostingsQueue` for operators.

---

### Feature 7: Audit log

#### BE
- `GET /v1/tenants/{tenantId}/audit?resourceType=...&resourceId=...&correlationId=...`.
- Every mutation writes audit record.

#### FE
- Audit log viewer per tenant/book/resource.
- `CorrelationIdChip` linking related records.

---

## 6. API Surface

| Endpoint | Actor | Purpose |
|---|---|---|
| `POST /bff/auth/login` | public | username/password login |
| `POST /bff/auth/logout` | authenticated | logout |
| `GET /bff/session` | public | session status |
| `POST /v1/tenants` | PLATFORM_ADMIN | create PSP tenant |
| `POST /v1/tenants/with-kyc` | PSP_ADMIN / TPTS_OPS | onboard supply-chain tenant with KYC |
| `GET /v1/tenants/{tenantId}` | scoped | tenant detail |
| `GET /v1/tenants/{tenantId}/children` | scoped | child list |
| `GET /v1/tenants/{tenantId}/kyc` | scoped | KYC case + data |
| `GET /v1/tenants/{tenantId}/kyc/checks` | PSP_ADMIN / TPTS_OPS | screening checks |
| `POST /v1/tenants/{tenantId}/kyc/approve` | PSP_ADMIN / TPTS_OPS | approve KYC (four-eyes) |
| `POST /v1/tenants/{tenantId}/kyc/reject` | PSP_ADMIN / TPTS_OPS | reject KYC |
| `POST /v1/tenants/{tenantId}/kyc/request-info` | PSP_ADMIN / TPTS_OPS | request more info |
| `POST /v1/tenants/{tenantId}/activate` | PSP_ADMIN | direct activation edge case |
| `GET /v1/permissions` | authenticated | permission catalog |
| `GET /v1/tenants/{tenantId}/roles` | scoped | roles |
| `POST /v1/tenants/{tenantId}/roles/{roleId}/assignments` | scoped | assign role |
| `POST /v1/approvals` | any maker | submit for approval |
| `POST /v1/approvals/{id}/approve` | checker | approve |
| `POST /v1/approvals/{id}/reject` | checker | reject |
| `GET /v1/approvals` | checker | approval queue |
| `GET /v1/tenants/{tenantId}/books` | scoped | books |
| `POST /v1/tenants/{tenantId}/books/{bookId}/provision-default-coa` | PSP_ADMIN / TENANT_ADMIN | seed template |
| `POST /v1/tenants/{tenantId}/books/{bookId}/gl-accounts` | scoped | create account (four-eyes) |
| `GET /v1/tenants/{tenantId}/books/{bookId}/gl-accounts` | scoped | list accounts |
| `GET /v1/tenants/{tenantId}/books/{bookId}/gl-accounts/{id}` | scoped | account detail |
| `GET /v1/tenants/{tenantId}/books/{bookId}/gl-accounts/{id}/balance` | scoped | live balance |
| `POST /v1/tenants/{tenantId}/journal-entries` | TENANT_ADMIN | create JE draft |
| `GET /v1/tenants/{tenantId}/journal-entries` | scoped | list JEs |
| `GET /v1/tenants/{tenantId}/journal-entries/{id}` | scoped | JE detail |
| `POST /v1/tenants/{tenantId}/journal-entries/{id}/submit-for-approval` | TENANT_ADMIN | submit JE |
| `POST /v1/tenants/{tenantId}/journal-entries/{id}/approve` | TENANT_CHECKER / PSP_ADMIN | approve JE |
| `POST /v1/tenants/{tenantId}/journal-entries/{id}/check-status` | scoped | recovery |
| `GET /v1/tenants/{tenantId}/audit` | audit viewer | audit log |

---

## 7. UI Screens by Actor

### PLATFORM_ADMIN screens
- Login
- Dashboard
- Platform admin: create PSP tenant
- Permission catalog (read-only)
- Audit log (platform scope)

### PLATFORM_ADMIN screens
- Login
- Dashboard
- Platform admin: create PSP tenant
- Seed KYC master data
- Permission catalog (read-only)
- Audit log (platform scope)

### PSP_ADMIN / TPTS_OPS screens
- Login
- Dashboard (PSP tenant scope)
- Tenant directory grouped by subtype (Manufacturer / Distributor / Dealer / Wholesaler / Merchant)
- Onboard new tenant via KYC wizard (five tabs)
- KYC review panel (approve / reject / request info)
- PSP CoA tree
- Approve GL account creation
- Approve JE (when acting as tenant checker)
- Approval queue
- Uncertain postings queue
- Audit log (PSP + children scope)

### TENANT_ADMIN screens
- Login
- Dashboard (tenant scope)
- Applicant status page (while tenant PENDING)
- Tenant CoA tree
- Create GL account (requires checker)
- Journal entries list
- Create journal entry (draft)
- Submit JE for approval
- JE detail / posting state timeline

### TENANT_CHECKER screens
- Login
- Approval queue
- Approve/reject JE (`ApprovalDiffDialog`)
- JE detail (read-only)

---

## 8. Non-Functional Requirements

| Requirement | Target |
|---|---|
| JE latency p99 | < 50 ms ingress -> TB commit (no external rails) |
| Four-eyes bypass | Zero tolerance; automated tests assert no single `person_id` can make+check |
| Audit durability | Synchronous PostgreSQL write before ack |
| Recovery | Uncertain commits resolve to exactly one outcome |
| Mobile-first | Base styles for small screen; desktop enhancements via `min-width` breakpoints |
| Accessibility | WCAG 2.2 AA floor; axe CI gate |
| Bundle budget | Shell < 200 KB gzipped; route chunks < 80 KB gzipped |

---

## 9. Acceptance Criteria (must pass in E2E)

1. **Bootstrap**: A fresh environment starts with one seeded Platform Admin who can log in.
2. **KYC master data**: Platform Admin seeds business types, MCC codes, bank list, branch codes, countries, and document types.
3. **Create PSP**: Platform Admin creates a PSP tenant; PSP Admin user is auto-created or assigned.
4. **Seed PSP CoA**: PSP Admin provisions the PSP CoA template.
5. **Onboard manufacturer via KYC**: PSP Admin selects "Manufacturer" subtype, fills all five KYC tabs, and submits.
6. **Atomic rollback**: A submission that fails validation or a simulated screening FAIL rolls back; no orphan tenant/admin/KYC case exists.
7. **Applicant created**: The system auto-generates the applicant admin username from Legal Business Name + Registration Number; the applicant can sign in but only access their own KYC/status endpoints while the org is `PENDING`.
8. **KYC review panel**: TPTS Ops / second PSP Admin opens the KYC review panel and sees IDENTITY + SANCTIONS checks and risk rating.
9. **Four-eyes KYC approval**: A different `person_id` from the onboarding PSP Admin approves the KYC.
10. **Activation**: On KYC approval, tenant becomes `ACTIVE`, books become `ACTIVE`, CoA template is provisioned, and activation is audited.
11. **Create GL account**: Tenant Admin creates a GL account; TENANT_CHECKER or PSP_ADMIN approves; account becomes `ACTIVE`.
12. **Create JE**: Tenant Admin creates a manual JE with at least two balanced lines (debits = credits).
13. **Approve JE**: A different tenant principal (checker) approves the JE.
14. **Post JE**: JE moves `READY -> SUBMITTING -> COMMITTED -> FINALIZED`; appears in journal list as `Posted`.
15. **Balance correct**: Account balance endpoint reflects the posted amount.
16. **Audit complete**: Audit log shows every step with the same `correlationId` chain.
17. **Self-approval blocked**: Attempting to approve own JE returns `403 MAKER_CANNOT_APPROVE` and the UI surfaces it.
18. **KYC self-review blocked**: The PSP Admin who submitted a KYC cannot approve it; UI surfaces this.
19. **Rejection path**: TPTS Ops rejects a KYC with reason; applicant is archived and cannot sign in.
20. **Bank change re-screening**: A tenant admin changes a settlement bank account; a new SANCTIONS screening check is recorded and a second person must approve the change.
21. **Uncertain commit recovery**: A simulated crash after TB commit but before finalization produces `COMMIT_UNKNOWN`; calling `check-status` resolves to `FINALIZED` with no duplicate transfer IDs.
22. **No token in browser**: SPA never holds access token or client secret; session is cookie-based.
23. **Namibian validation**: BIPA number, TIN, and branch code fields reject invalid formats and normalize correctly.
24. **UBO threshold**: System flags UBOs with ≥25% ownership and rejects submissions where no UBO reaches the threshold.

---

## 10. Build Sequence

1. **Repo + infra**: monorepo, Docker Compose (PostgreSQL, TigerBeetle), Spring Boot core + BFF, Vite React SPA.
2. **KYC master data model + seed**: business types, MCC, banks, branches, countries, document types, validation rules.
3. **Local identity + session**: seeded Platform Admin, login/logout, `/session`, route guards.
4. **Permission catalog + roles**: seed permissions and roles (incl. `kyc.*`, `bank.account.*`), effective-permission API.
5. **Four-eyes approval aggregate**: create/approve/reject approvals.
6. **Tenant/org model**: create PSP, tenant subtype enum.
7. **KYC case + screening model**: five-tab data capture, simulated IDENTITY + SANCTIONS checks, risk rating.
8. **Onboarding transaction**: `POST /v1/tenants/with-kyc` creates tenant + admin + KYC + books atomically.
9. **KYC review + activation**: review panel APIs, approve/reject/request-info, tenant activation on approval.
10. **Book + CoA model**: create books, seed templates by tenant subtype, GL account CRUD with recovery.
11. **TigerBeetle integration**: deterministic account IDs, account creation, balance read.
12. **JE engine**: create draft, balanced validation, direct matching, TB submission.
13. **Posting state machine + finalization**: `READY -> SUBMITTING -> COMMITTED -> FINALIZED`.
14. **Uncertain-commit recovery**: `COMMIT_UNKNOWN` detection and `check-status` resolution.
15. **Audit + outbox**: append-only audit, canonical events.
16. **UI shell + design system**: `AppShell`, `ScrollArea`, tokens, atoms, molecules.
17. **UI screens**: login, dashboard, KYC onboarding wizard, KYC review panel, applicant status page, tenant directory, CoA, approvals, JE create/approve/list/detail, uncertain postings, audit log.
18. **E2E acceptance test**: full actor flow including KYC onboarding.
19. **CI + runbook**.

---

## 11. Definition of Done

- [ ] All 24 acceptance criteria pass in automated E2E test.
- [ ] Unit/property tests cover: direct debit-to-credit matching, uncertain-commit recovery, four-eyes self-approval rejection, Namibian format normalization, KYC risk rating rules.
- [ ] API contracts typed and shared between backend and SPA.
- [ ] UI components have Storybook stories for key states.
- [ ] CI passes lint, type-check, tests, and bundle budget.
- [ ] Runbook documents local dev setup, TB reset, KYC seed data, and uncertain-commit recovery.

---

## 12. Extension Path

After Phase-0 is accepted, the next slices are:

1. **Slice 1 — Extract KYC to plugin + provider integrations**: Move KYC to a separately deployable plugin; add real document upload, OCR/liveness, sanctions/PEP/adverse-media providers.
2. **Slice 2 — PSP payment flow**: Authorization pending JE, capture JE, network cost JE, payout custody model, settlement reconciliation.
3. **Slice 3 — Multi-currency + FX**: Separate books per currency, FX rate plugin, cross-currency `PostingGroup`.
4. **Slice 4 — Inter-org transfers**: Multi-book `PostingGroup`, due-to/due-from, parent routing.
5. **Slice 5 — FAPI 2.0 hardening**: PAR, PKCE S256, DPoP/mTLS, full BFF-AS-RS conformance path.
