# 12. Notifications & Push Architecture

> **Status:** live (F-12 slice). **Normative:** AGENTS.md §2c (privacy), §2 (7) (outbox),
> Chapter 06 (outbox), Chapter 08 (REST). **Migration:** `V23__notifications_and_push.sql`.

## 12.1 Why a queue-shaped design, not a fire-and-forget sender

A push notification is a *pointer*, never a record of truth. FSP therefore splits the
problem into three independent, crash-safe pieces:

```mermaid
flowchart LR
    A["Domain moment<br/>(ApprovalService opens<br/>a four-eyes request)"] -->|same tx| B["notifications table<br/>(rows per checkee, deduped<br/>+ PushRequired outbox row)"]
    B -->|@Scheduled sweep<br/>pushed_at IS NULL| C["PushDispatcher"]
    C -->|per device| D["PushPublisher adapters<br/>webpush · apns · fcm"]
    D --> E["Device"]
    A -->|same SPA| F["In-app inbox + badge<br/>(GET /v1/notifications)"]
```

1. **The `notifications` table IS the push queue.** The domain transaction writes the
   rows; nothing memory-held, nothing lost on restart, catches up after days of downtime
   and (with the `fsp.push.webpush.enabled=false` default) can run *fully dormant* — the
   inbox/badge works with zero credentials. `pushed_at IS NULL` is the queue cursor;
   `pushed_at + push_via` is delivery evidence (claimed atomically).
2. **One outbox row per batch** (`Notification.PushRequired` in `outbox_events`) gives the
   audit-evidence trail "the platform intended to notify" under Chapter 06 rules — inside
   the same DB transaction, so a rollback never sends a push for a thing that never happened.
3. **Dispatch is a scheduled sweep** (`fsp.push.dispatchFixedDelay`, default 2 s, settle
   window 2 s so a just-written row isn't read mid-transaction). Single-instance Phase-0;
   the claim is already a guarded UPDATE for the multi-replica hardening slice.

## 12.2 Common push architecture (one contract, three channels)

FSP designs for **iOS (APNs), Android (FCM) and browsers (Web Push) against one uniform
contract** — the device registers, the server dispatches to whichever channel the device
declared. A channel with no credentials is simply **ABSENT**: no bean, no dispatch, no
error — adding credentials later is a pure config change (`fsp.push.*`).

```
Device-side flow (any platform):
  App obtains device capability (browser: PushManager.subscribe(VAPID);
  native: OS push token) → POST /v1/notifications/push/subscriptions
      { platform: WEBPUSH|APNS|FCM, endpoint | token, p256dh?, auth? }
  → row in push_subscriptions (one identity per device:
      WEBPUSH by endpoint URL, APNs/FCM by token; unique among ACTIVE)

Server-side flow:
  PushDispatcher → person's ACTIVE subscriptions → matching PushPublisher bean
  → Delivered           → notifications.pushed_at claimed, push_via = channel
  → definitive 4xx      → subscription retired (status=DEAD)  — 404/410 semantics
  → non-definitive      → push_attempts++ (bounded, give up at 3)
  → no channel/credentials/subscriptions → claimed with push_via = NONE
```

| Channel | Adapter | Credential gate | Encryption / auth | Notes |
|---|---|---|---|---|
| **Web Push** | `WebPushPublisher` | `fsp.push.webpush.enabled` + base64url VAPID P-256 keypair | RFC 8291 `aes128gcm` end-to-end encryption + RFC 8292 VAPID JWT (`Authorization: vapid t=…, k=…`) | **Default channel.** The push service never sees plaintext. JDK-only crypto (`WebPushCrypto`); no new dependencies. |
| **Apple (APNs)** | `ApnsPublisher` | `fsp.push.apns.enabled` + team-id + key-id + topic + `.p8` key (PEM or path, mounted like the IdP key) | HTTP/2 provider API, ES256 **provider JWT** (`kid` = APNs key id, iss = team id, ≤ 60 min) | 403/404/410 retire the device token (definitive). |
| **Google (FCM)** | `FcmPublisher` | `fsp.push.fcm.enabled` + project-id + service-account key JSON (PEM RSA) | OAuth2 JWT-bearer exchange (RS256, 1-h access token, cached 45 min), FCM v1 `messages:send` | `UNREGISTERED`/404 retires the token. |

Generating the VAPID keypair (openssl, no node tooling needed):

```bash
openssl ecparam -name prime256v1 -genkey -noout -out vapid.pem
openssl ec -in vapid.pem -pubout -outform DER 2>/dev/null | tail -c 65 \
  | base64 | tr '+/' '-_' | tr -d '='   # → FSP_PUSH_WEBPUSH_PUBLIC_KEY
# private key → FSP_PUSH_WEBPUSH_PRIVATE_KEY (base64 of the DER PKCS#8)
```

Credentials arrive **only via env** (`FSP_PUSH_*`), are mounted at runtime like the IdP
signing key (AGENTS §7 containers rule), never baked into images, never logged.

## 12.3 FAPI 2.0 & data minimization implications

FAPI 2.0 governs the OAuth machinery; push adds a *second, quieter* outbound path, so the
slice applies FAPI's spirit deliberately:

1. **Data minimization is the payload contract (AGENTS §2c).** The wire payload is
   `{type, title, body, tenantId, link}` with **generic words** ("A settlement bank
   account filing is waiting for a checker decision."). No amounts, no account numbers,
   no names, no KYC payloads. The link is a route, not evidence; the device can re-fetch
   the *authorized* resource through the normal gateway/boundary. This keeps Web Push's
   end-to-end encryption the *defense in depth*, not the sole privacy control: a
   compromised OS notification centre or a stolen lockscreen shows nothing sensitive.
2. **The push plane is transport-only, never a decision or money path.** Notifications
   never carry commands; clicking one only navigates. A replayed or forged notification
   cannot move states — the four-eyes/idempotency machinery is untouched (§2d/§2e).
   Conversely the dispatcher runs inside core's authenticated DB context and never
   accepts inbound traffic.
3. **Device ownership is person-plane bound.** Only PERSON actors register devices
   (machine/DELEGATED refused); the row binds to the person's **home tenant** (not the
   act-as target), so a "sudo into tenant" session cannot re-base someone's devices;
   reads are `notification.view`-gated at the PDP like every core call.
4. **No PII in logs.** Dispatch logs record notification ids, platforms and person ids —
   never push tokens, VAPID keys or payload text. Failures log reason + status codes.
5. **FAPI note — untrusted notification center.** The OS layer is *outside* every trust
   boundary; the design assumes its contents are shoulder-surfable. That is exactly why
   the pointer pattern (generic copy + opaque link + server-side re-authorization on
   click-through) is mandated rather than "put the number in the notification".

## 12.4 HTTP surface (`/v1/notifications`, permission `notification.view`)

| Method & path | Purpose | Semantics |
|---|---|---|
| `GET /v1/notifications` | Inbox page | `{items: NotificationView[], unread}` (newest first). |
| `GET /v1/notifications/unread-count` | **Badge poll target** (`{unread}`) — no rows over the wire. | The SPA polls this every 30 s; cheapest possible check. |
| `POST /v1/notifications/read-all` | Mark whole inbox read (204). | One click; the queue keeps its own truth. |
| `GET /v1/notifications/push/config` | `{webpushEnabled, vapidPublicKey}` | Public key exposure for the SPA service worker; `webpushEnabled=false` when the channel is off. |
| `POST /v1/notifications/push/subscriptions` | Register device (`PushSubscribeRequest`) | Per-platform validation (WEBPUSH needs an `https://` endpoint; APNs/FCM need a token); re-subscription of a known device refreshes key material in place (one row per device). |
| `DELETE /v1/notifications/push/subscriptions/{endpoint}` | Browser forgot the device | Retires the row (definitive) after the owner check. |

SPA plumbing: `public/fsp-push-sw.js` (push + `notificationclick` handlers),
`web-core/push-core.ts` (unread polling + Web Push enable, both fail-soft — the badge is
cosmetic), wired at first authed hydration (`SessionProvider`) and surfaced as the
`approvals-badge` on the Approvals nav item (`AppShell`).

## 12.5 Data model (V23)

* **`notifications`** — `id, person_id, tenant_id, type, op_type, title, body,
  resource_type, resource_id, link, read_at, pushed_at, push_attempts (default 0),
  push_via, created_at`. Indexes: inbox list (`person_id, created_at DESC`), unread
  count partial, push-queue scan partial (`pushed_at IS NULL`), one-per-person-per-resource
  unique dedupe, per-person-per-resource read index.
* **`push_subscriptions`** — `id, person_id, tenant_id, platform (WEBPUSH|APNS|FCM),
  endpoint, token, p256dh, auth, user_agent, status (ACTIVE|DEAD), last_push_at,
  unsubscribed_at, created_at, updated_at`. CHECK: WEBPUSH ⇔ endpoint, APNs/FCM ⇔ token;
  unique endpoint/token among ACTIVE.
* **Permission** — `notification.view` (READ, component `notify`), granted to every admin
  and checker role (idempotent inserts, `ON CONFLICT DO NOTHING` — §2.5).

## 12.6 Recipient resolution & the hardening ledger

Recipients of an approval-open notification = **ACTIVE persons of the approval row's
tenant holding the checker permission for that op type** (`checkerPermissionOf`, the same
mapping approvals use), minus the maker (four-eyes §3.1). Same-tenant scope in Phase-0;
subtree recipients (PSP notified about tenant queues they supervise) = ⛏ hardening slice.
KYC plugin approvals surface through the same hook (permission from the registered plugin
manifest); plugin types that don't resolve simply notify nobody.

Also ⛏: multi-instance dispatcher claim-before-send; retention/purge job for
`notifications` + DEAD `push_subscriptions`; native-app delivery (APNs/FCM credentials
wiring in prod environments); notification preferences (mute per type).
