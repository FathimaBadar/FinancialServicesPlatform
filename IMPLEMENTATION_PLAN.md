# FAPI 2.0 + PSP/EMI Compliance Implementation Plan

## Phase 1: Critical FAPI 2.0 Gaps (G1-G10) - CURRENT FOCUS

### 1.1 IdP: PAR Endpoint (`POST /par`)
- Accept pushed authorization requests with all auth params
- Authenticate client via `private_key_jwt` or mTLS
- Validate PKCE challenge (S256)
- Store params, return opaque `request_uri` with `expires_in`

### 1.2 IdP: Authorization Endpoint (`GET /authorize`)
- Accept only `client_id` + `request_uri`
- Validate `request_uri` exists, not expired, not used
- Redirect to hosted sign-in page
- Return authorization response with `code` + `state` + `iss`

### 1.3 IdP: Token Endpoint (`POST /token`)
- Accept `authorization_code` grant with PKCE verifier
- Client auth via `private_key_jwt` (validate `aud` = issuer string)
- Validate DPoP proof on token request
- Issue access token with `cnf.jkt` claim (JWK thumbprint)
- Support DPoP nonce challenge

### 1.4 IdP: JWKS & Discovery
- Publish client JWKS endpoint or static key registration
- Update `.well-known/openid-configuration` with PAR endpoint

### 1.5 BFF: PAR + Auth Code Flow
- Replace ROPC login with PAR flow
- Generate PKCE verifier/challenge per session
- Generate DPoP key pair per session
- POST to `/par` with `private_key_jwt` auth
- Redirect UA to `/authorize?client_id&request_uri`
- Handle callback: validate `iss`, exchange code with DPoP + `private_key_jwt`
- Store access token + DPoP key in session

### 1.6 BFF: DPoP Proof Generation
- Generate fresh DPoP proof per API request
- Include `htu`, `htm`, `jti`, `iat`, `cnf.jwk`
- Add `DPoP` header to all proxied API calls

### 1.7 Gateway: DPoP Validation (Resource Server)
- Validate DPoP proof on `/v1/**` requests
- Check `cnf.jkt` matches access token thumbprint
- Verify `htu`/`htm` match request
- Check `jti` replay cache
- Return 401 on validation failure

### 1.8 Frontend: Login Redirect
- Remove username/password fields from login form
- Redirect to `/bff/auth/login?return_to=...` which initiates PAR flow
- No credentials in browser

### 1.9 CSRF Rotation at Login
- Rotate CSRF cookie on successful login
- Regenerate session attributes

### 1.10 Remove CORS from Auth Endpoints
- Ensure `/par`, `/authorize` have no `Access-Control-Allow-Origin`

---

## Phase 2: EMI Core (G11-G12)
- EMI CoA template with safeguarding accounts
- Safeguarding headroom check in JournalService
- Balance bounds for 1:1 redemption

## Phase 3: PSP Enhancements (G13)
- Posting rules for interchange fees (4100/5100/5200)

## Phase 4: Plugin Architecture (G14-G15)
- Plugin readiness interceptor (4 gates)
- Per-installation secret scope

## Phase 5: Reporting & DORA (G16-G17)
- EMI regulatory report endpoints
- Incident reporting + REP018

## Phase 6: Build Artifacts (G18)
- Route inventory Gradle task