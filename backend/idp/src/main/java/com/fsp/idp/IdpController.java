package com.fsp.idp;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * IdP surface: token issuance (public, credential-authenticated), JWKS (public), introspection
 * (public), tenant IdP policy (internal hop via gateway). The native IdP is the DEFAULT provider;
 * tenant admins flip to THIRD_PARTY here.
 * FAPI 2.0 endpoints: PAR (/par), Authorization (/authorize), Token (/token with auth_code).
 */
@RestController
@RequestMapping("/idp")
public class IdpController {

    private static final Logger log = LoggerFactory.getLogger(IdpController.class);

    /** Closed set of reasons the hosted error page will render; anything else shows as unknown_error. */
    private static final java.util.Set<String> ERROR_CODES = java.util.Set.of(
        "request_uri_invalid", "authentication_failed", "account_inactive", "tenant_inactive",
        "federation_pending", "server_error", "unknown_error");

    private final IdpTokenService tokenService;
    private final ParService parService;
    private final IdpAuthService auth;
    private final IdpProperties props;
    private final JdbcTemplate jdbc;
    private final PPersonRepository persons;
    private final org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder bcrypt =
        new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();

    public IdpController(IdpTokenService tokenService, ParService parService, IdpAuthService auth,
                         IdpProperties props, JdbcTemplate jdbc, PPersonRepository persons) {
        this.tokenService = tokenService;
        this.parService = parService;
        this.auth = auth;
        this.jdbc = jdbc;
        this.props = props;
        this.persons = persons;
    }

    // ========== FAPI 2.0: Pushed Authorization Request (PAR) ==========

    @PostMapping(value = "/par", consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE)
    public IdpDtos.ParResponse pushedAuthzRequest(@RequestBody Map<String, String> body,
                                                   @RequestHeader(value = "Authorization", required = false) String authHeader) {
        // Snake_case wire params (RFC 9126 §2.1); client_assertion sent as Bearer (private_key_jwt)
        String clientAssertion = null;
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            clientAssertion = authHeader.substring(7).trim();
        }
        IdpDtos.ParRequest request = new IdpDtos.ParRequest(
            body.get("grant_type"), body.get("code_challenge"), body.get("code_challenge_method"),
            body.get("redirect_uri"), body.get("response_type"), body.get("scope"),
            body.get("authorization_details"), body.get("resource"),
            body.get("client_assertion"), body.get("client_assertion_type"), body.get("state"));
        if (clientAssertion == null) {
            clientAssertion = body.get("client_assertion");
        }
        return parService.createParRequest(request, clientAssertion);
    }

    /** Simulated error surface for the hosted (Phase-0) sign-in flows. */
    @GetMapping(value = "/error", produces = MediaType.TEXT_HTML_VALUE)
    @org.springframework.web.bind.annotation.ResponseBody
    public String errorPage(@RequestParam(value = "code", required = false) String code) {
        // Only allow-listed codes are rendered: the query string is attacker-controlled
        String safe = code != null && ERROR_CODES.contains(code) ? code : "unknown_error";
        return """
            <!doctype html><html lang="en"><head><meta charset="utf-8">
            <title>FSP Identity Provider &middot; Error</title>
            <style>body { font-family: system-ui, sans-serif; background: #101418; color: #e8edf2;
                   display: grid; place-items: center; min-height: 100dvh; margin: 0; }</style>
            </head><body><div style="text-align:center">
            <p style="font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:#f0a10e">FSP Identity Provider</p>
            <h1 style="font-weight:600">Sign-in could not continue</h1>
            <p style="color:#9fb0c0">Reason: %s &mdash; restart sign-in from your portal.</p>
            </div></body></html>
            """.formatted(safe);
    }

    // ========== FAPI 2.0: Authorization Endpoint ==========

    @GetMapping(value = "/authorize")
    public RedirectView authorize(@RequestParam("client_id") String clientId,
                                   @RequestParam("request_uri") String requestUri) {
        // 1. Peek PAR request (validates expiry; consumed at callback completion)
        ParService.ParRequestData parData = parService.peekParRequest(requestUri);
        if (parData == null) {
            // Invalid/expired/used request_uri - redirect to error page
            return new RedirectView("/idp/error?code=request_uri_invalid");
        }

        // 2. Store PAR data in session or pass via request attribute for the login page
        // In a real implementation, this would render a hosted sign-in page
        // For now, we simulate by redirecting to a login page with the PAR data encoded
        // The login page would authenticate the user and then call back to /authorize/callback
        
        // Build the login page URL with PAR context
        String loginUrl = "/idp/login?request_uri=" + java.net.URLEncoder.encode(requestUri, java.nio.charset.StandardCharsets.UTF_8)
            + "&client_id=" + java.net.URLEncoder.encode(clientId, java.nio.charset.StandardCharsets.UTF_8);
        
        return new RedirectView(loginUrl);
    }

    /** Simulated hosted sign-in page (Phase-0): the SCA surface lives at the IdP, never in BFF/SPA. */
    @GetMapping(value = "/login", produces = MediaType.TEXT_HTML_VALUE)
    @org.springframework.web.bind.annotation.ResponseBody
    public String loginPage(@RequestParam("request_uri") String requestUri,
                            @RequestParam("client_id") String clientId) {
        // Raw URI, HTML-escaped for the attribute; the browser URL-encodes it on form submit
        String enc = html(requestUri);
        return """
            <!doctype html><html lang="en"><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>FSP Identity Provider &middot; Sign in</title>
            <style>
              body { font-family: system-ui, sans-serif; background: #101418; color: #e8edf2;
                     display: grid; place-items: center; min-height: 100dvh; margin: 0; }
              .panel { background: #1a2029; border: 1px solid #2a323d; border-radius: 12px;
                       padding: 2rem; width: min(92vw, 22rem); }
              h1 { font-size: 1.05rem; margin: 0 0 .25rem; }
              p.eyebrow { font-size: .7rem; letter-spacing: .12em; text-transform: uppercase;
                          color: #f0a10e; margin: 0 0 .75rem; }
              label { display: block; font-size: .75rem; margin: .75rem 0 .25rem; color: #9fb0c0; }
              input { width: 100%%; box-sizing: border-box; padding: .55rem .7rem; border-radius: 8px;
                      border: 1px solid #3a4450; background: #101418; color: #e8edf2; font: inherit; }
              button { margin-top: 1.25rem; width: 100%%; padding: .6rem; border: 0; border-radius: 8px;
                       background: #f0a10e; color: #101418; font-weight: 700; cursor: pointer; }
              .hint { margin-top: 1rem; font-size: .7rem; color: #7a8a99; line-height: 1.5; }
            </style></head><body><div class="panel">
            <p class="eyebrow">FSP Identity Provider</p>
            <h1>Sign in to continue</h1>
            <form method="post" action="/idp/authorize/callback">
              <input type="hidden" name="request_uri" value="%s">
              <label for="u">Username</label>
              <input id="u" name="username" autocomplete="username" required autofocus>
              <label for="p">Password</label>
              <input id="p" name="password" type="password" autocomplete="current-password" required>
              <button type="submit">Sign in</button>
            </form>
            <p class="hint">Client: %s &middot; Your credentials never leave the Identity Provider.</p>
            </div></body></html>
            """.formatted(enc, html(clientId));
    }

    // ========== FAPI 2.0: Authorization Callback (after user consent) ==========

    // POST only: credentials travel in the form body, never in the URL (history, logs, Referer)
    @PostMapping(value = "/authorize/callback", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public Object authorizeCallback(@RequestParam("request_uri") String requestUri,
                                           @RequestParam("username") String username,
                                           @RequestParam("password") String password) {
        // In a real implementation, this would be after the user authenticates at the hosted sign-in page
        // For Phase-0, we simulate by accepting username/password here (but this should be a full-page IdP form)
        
        // 1. Consume PAR request
        ParService.ParRequestData parData = parService.consumeParRequest(requestUri);
        if (parData == null) {
            log.warn("idp_authorize_failed reason=request_uri_invalid");
            return new RedirectView("/idp/error?code=request_uri_invalid");
        }

        // 2. Authenticate user (in real flow, this happens at IdP hosted page)
        // For now, delegate to token service password grant to validate credentials
        IdpDtos.TokenGrant grant = new IdpDtos.TokenGrant("password", username, password, parData.clientId(), null);
        try {
            IdpDtos.TokenResponse tokenResp = tokenService.grantPassword(grant);
            
            // 3. Store auth code linked to this user
            String authCode = parService.storeAuthCode(parData, 
                UUID.fromString(tokenResp.claims().userId()), 
                UUID.fromString(tokenResp.claims().tenantId()));
            
            // 4. Redirect back to client's redirect_uri with code + the client's OWN state + iss
            StringBuilder redirectUri = new StringBuilder(parData.redirectUri())
                .append("?code=").append(URLEncoder.encode(authCode, StandardCharsets.UTF_8));
            if (parData.state() != null) {
                redirectUri.append("&state=").append(URLEncoder.encode(parData.state(), StandardCharsets.UTF_8));
            }
            redirectUri.append("&iss=").append(URLEncoder.encode(props.getIssuer(), StandardCharsets.UTF_8));
            log.info("idp_authorize_succeeded clientId={} username={}", parData.clientId(), username);
            return new RedirectView(redirectUri.toString());
        } catch (IdpProblemException e) {
            // F-8: first sign-in with the bootstrap password → the person sets their own
            // password AT the IdP (hosted surface), credentials never touch BFF/SPA.
            if ("PASSWORD_CHANGE_REQUIRED".equals(e.problem().code())) {
                PPerson person = persons.findByUsername(username).orElse(null);
                if (person != null) {
                    String ticket = parService.storePasswordChangeTicket(username, person.id, person.tenantId, parData);
                    log.info("idp_password_change_page username={} clientId={}", username, parData.clientId());
                    return changePage(ticket, "");
                }
            }
            // V30 MFA: password verified, verification code already dispatched — park the PAR
            // in an OTP-sized ticket and render the code step at the IdP itself.
            if ("MFA_REQUIRED".equals(e.problem().code())) {
                PPerson person = persons.findByUsername(username).orElse(null);
                if (person != null) {
                    String ticket = parService.storeMfaTicket(username, person.id, person.tenantId, parData);
                    log.info("idp_mfa_page username={} clientId={}", username, parData.clientId());
                    return mfaPage(ticket, "");
                }
            }
            // Business rejection (grantPassword already logged the credential detail); map to a page code
            String code = switch (e.problem().code()) {
                case "INVALID_CREDENTIALS", "INVALID_REQUEST" -> "authentication_failed";
                case "PERSON_INACTIVE" -> "account_inactive";
                case "MFA_CODE_INVALID", "MFA_CODE_EXPIRED", "MFA_ATTEMPTS_EXHAUSTED" -> "authentication_failed";
                case "TENANT_INACTIVE", "TENANT_MISSING" -> "tenant_inactive";
                case "IDP_EXTERNAL_FEDERATION_PENDING" -> "federation_pending";
                default -> "authentication_failed";
            };
            log.warn("idp_authorize_failed clientId={} username={} problem={} status={}",
                parData.clientId(), username, e.problem().code(), e.problem().status());
            return new RedirectView("/idp/error?code=" + code);
        } catch (RuntimeException e) {
            log.error("idp_authorize_error clientId={} username={}", parData.clientId(), username, e);
            return new RedirectView("/idp/error?code=server_error");
        }
    }

    private static String html(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace("\"", "&quot;").replace("'", "&#39;");
    }

    // ========== F-8: forced first-login password change (hosted at the IdP) ==========

    private static final int PW_MIN_LENGTH = 10;
    private static final int PW_MAX_LENGTH = 128;

    /** Hosted change form: credentials and the replacement never leave the IdP origin. */
    private String changePage(String ticket, String error) {
        return """
            <!doctype html><html lang="en"><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>FSP Identity Provider &middot; Set your password</title>
            <style>
              body { font-family: system-ui, sans-serif; background: #101418; color: #e8edf2;
                     display: grid; place-items: center; min-height: 100dvh; margin: 0; }
              .panel { background: #1a2029; border: 1px solid #2a323d; border-radius: 12px;
                       padding: 2rem; width: min(92vw, 22rem); }
              h1 { font-size: 1.05rem; margin: 0 0 .25rem; }
              p.eyebrow { font-size: .7rem; letter-spacing: .12em; text-transform: uppercase;
                          color: #f0a10e; margin: 0 0 .75rem; }
              label { display: block; font-size: .75rem; margin: .75rem 0 .25rem; color: #9fb0c0; }
              input { width: 100%%; box-sizing: border-box; padding: .55rem .7rem; border-radius: 8px;
                      border: 1px solid #3a4450; background: #101418; color: #e8edf2; font: inherit; }
              button { margin-top: 1.25rem; width: 100%%; padding: .6rem; border: 0; border-radius: 8px;
                       background: #f0a10e; color: #101418; font-weight: 700; cursor: pointer; }
              .hint { margin-top: 1rem; font-size: .7rem; color: #7a8a99; line-height: 1.5; }
              .error { margin-top: 1rem; font-size: .75rem; color: #e5484d; }
              .error:empty { display: none; }
            </style></head><body><div class="panel">
            <p class="eyebrow">FSP Identity Provider</p>
            <h1>Set your own password</h1>
            <form method="post" action="/idp/password/complete">
              <input type="hidden" name="ticket" value="%s">
              <label for="np">New password</label>
              <input id="np" name="new_password" type="password" autocomplete="new-password" required autofocus>
              <label for="npc">Confirm new password</label>
              <input id="npc" name="confirm_password" type="password" autocomplete="new-password" required>
              <button type="submit">Set new password</button>
              <p class="error" id="chg-err">%s</p>
            </form>
            <p class="hint">At least %d characters. Your credentials never leave the Identity Provider.</p>
            </div></body></html>
            """.formatted(html(ticket), html(error), PW_MIN_LENGTH);
    }

    // POST only: the replacement secret travels in the form body, never the URL
    @PostMapping(value = "/password/complete", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public Object passwordChangeComplete(@RequestParam("ticket") String ticket,
                                         @RequestParam("new_password") String newPassword,
                                         @RequestParam("confirm_password") String confirmPassword) {
        ParService.PasswordChangeTicket t = parService.peekPasswordChangeTicket(ticket);
        if (t == null) {
            // Unknown/expired (already consumed, or the user sat on the form > 10 min)
            log.warn("idp_password_change_failed reason=ticket_invalid");
            return new RedirectView("/idp/error?code=request_uri_invalid");
        }
        if (newPassword == null || newPassword.length() < PW_MIN_LENGTH || newPassword.length() > PW_MAX_LENGTH) {
            log.warn("idp_password_change_rejected username={} reason=policy_length", t.username());
            return changePage(ticket, "Password must be %d–%d characters.".formatted(PW_MIN_LENGTH, PW_MAX_LENGTH));
        }
        if (!newPassword.equals(confirmPassword)) {
            log.warn("idp_password_change_rejected username={} reason=confirmation_mismatch", t.username());
            return changePage(ticket, "The two passwords do not match.");
        }
        PPerson person = persons.findById(t.personId()).orElse(null);
        if (person == null) {
            log.warn("idp_password_change_failed reason=person_missing username={}", t.username());
            return new RedirectView("/idp/error?code=account_inactive");
        }
        if (bcrypt.matches(newPassword, person.passwordHash)) {
            log.warn("idp_password_change_rejected username={} reason=same_as_current", t.username());
            return changePage(ticket, "Choose a password you have not used here before.");
        }
        person.passwordHash = bcrypt.encode(newPassword);
        person.mustChangePassword = false;
        persons.save(person);
        log.info("idp_password_changed personId={} username={}", person.id, t.username());

        // Resume the parked sign-in: same PAR data, same client, same state
        String authCode = parService.storeAuthCode(t.parData(), person.id, person.tenantId);
        StringBuilder redirectUri = new StringBuilder(t.parData().redirectUri())
            .append("?code=").append(URLEncoder.encode(authCode, StandardCharsets.UTF_8));
        if (t.parData().state() != null) {
            redirectUri.append("&state=").append(URLEncoder.encode(t.parData().state(), StandardCharsets.UTF_8));
        }
        redirectUri.append("&iss=").append(URLEncoder.encode(props.getIssuer(), StandardCharsets.UTF_8));
        parService.consumePasswordChangeTicket(ticket);
        log.info("idp_authorize_resumed clientId={} username={}", t.parData().clientId(), t.username());
        return new RedirectView(redirectUri.toString());
    }

    // ========== V30: MFA second step, hosted at the IdP (after the password step) ==========

    private Object mfaPage(String ticket, String error) {
        return """
            <!doctype html><html><head><meta charset="utf-8">
            <title>FSP — verification code</title><style>
            body { font-family: system-ui, sans-serif; background: #0d1117; color: #e8edf2;
                   display: grid; place-items: center; min-height: 100vh; margin: 0; }
            .panel { background: #161b22; border: 1px solid #2a323d; border-radius: 12px;
                     padding: 2rem; width: min(92vw, 22rem); }
            h1 { font-size: 1.05rem; margin: 0 0 .25rem; }
            p.eyebrow { font-size: .7rem; letter-spacing: .12em; text-transform: uppercase;
                        color: #f0a10e; margin: 0 0 .75rem; }
            label { display: block; font-size: .75rem; margin: .75rem 0 .25rem; color: #9fb0c0; }
            input { width: 100%%; box-sizing: border-box; padding: .55rem .7rem; border-radius: 8px;
                    border: 1px solid #3a4450; background: #101418; color: #e8edf2;
                    font: inherit; letter-spacing: .3em; }
            button { margin-top: 1.25rem; width: 100%%; padding: .6rem; border: 0; border-radius: 8px;
                     background: #f0a10e; color: #101418; font-weight: 700; cursor: pointer; }
            .hint { margin-top: 1rem; font-size: .7rem; color: #7a8a99; line-height: 1.5; }
            .error { margin-top: 1rem; font-size: .75rem; color: #e5484d; }
            .error:empty { display: none; }
            </style></head><body><div class="panel">
            <p class="eyebrow">FSP Identity Provider</p>
            <h1>Enter your verification code</h1>
            <form method="post" action="/idp/mfa/verify">
              <input type="hidden" name="ticket" value="%s">
              <label for="otp">Verification code</label>
              <input id="otp" name="otp" inputmode="numeric" pattern="[0-9]*" required autofocus>
              <button type="submit">Sign in</button>
              <p class="error" id="mfa-err">%s</p>
            </form>
            <p class="hint">A code was sent to your registered contact. It works for 5 minutes.
            FSP never gives codes over the phone.</p>
            </div></body></html>
            """.formatted(html(ticket), html(error));
    }

    // POST only: OTP travels in the form body, never the URL
    @PostMapping(value = "/mfa/verify", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public Object mfaVerify(@RequestParam("ticket") String ticket,
                            @RequestParam("otp") String otp) {
        ParService.MfaTicket t = parService.peekMfaTicket(ticket);
        if (t == null) {
            log.warn("idp_mfa_verify_failed reason=ticket_invalid");
            return new RedirectView("/idp/error?code=request_uri_invalid");
        }
        try {
            auth.verifyLoginCode(t.personId(), otp == null ? "" : otp.trim());
        } catch (IdpProblemException e) {
            log.warn("idp_mfa_verify_rejected username={} problem={}", t.username(), e.problem().code());
            return mfaPage(ticket, "Code rejected. " + e.problem().detail());
        }
        String authCode = parService.storeAuthCode(t.parData(), t.personId(), t.tenantId());
        StringBuilder redirectUri = new StringBuilder(t.parData().redirectUri())
            .append("?code=").append(URLEncoder.encode(authCode, StandardCharsets.UTF_8));
        if (t.parData().state() != null) {
            redirectUri.append("&state=").append(URLEncoder.encode(t.parData().state(), StandardCharsets.UTF_8));
        }
        redirectUri.append("&iss=").append(URLEncoder.encode(props.getIssuer(), StandardCharsets.UTF_8));
        parService.consumeMfaTicket(ticket);
        log.info("idp_mfa_verified username={} clientId={}", t.username(), t.parData().clientId());
        return new RedirectView(redirectUri.toString());
    }

    // ========== V30: self-service reset + MFA enrolment (bearer-authenticated) ==========

    /** Pre-auth reset request — ALWAYS 204, never reveals whether the username exists (RFC 9700). */
    @PostMapping(value = "/password/reset-request", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> passwordResetRequest(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        if (username != null && !username.isBlank()) {
            try {
                auth.requestPasswordReset(username.trim());
            } catch (org.springframework.dao.DataIntegrityViolationException e) {
                // concurrent duplicate lost the partial-unique race — the winner's code is live
                log.info("idp_reset_duplicate_suppressed");
            }
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/password/reset-confirm", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> passwordResetConfirm(@RequestBody Map<String, String> body) {
        auth.confirmPasswordReset(body.get("token"), body.get("newPassword"), body.get("confirmPassword"));
        return ResponseEntity.noContent().build();
    }

    @GetMapping(value = "/mfa", produces = MediaType.APPLICATION_JSON_VALUE)
    public Object mfaStatus(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UUID personId = tokenService.personFromBearer(authorization);
        return auth.state(personId);
    }

    /** Begin enrolment: a confirmation code goes to the chosen channel (possession proof). */
    @PutMapping(value = "/mfa", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> mfaBegin(@RequestHeader(value = "Authorization", required = false) String authorization,
                                         @RequestBody Map<String, String> body) {
        UUID personId = tokenService.personFromBearer(authorization);
        auth.beginEnrolment(personId, body.get("channel"));
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/mfa/confirm", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> mfaConfirm(@RequestHeader(value = "Authorization", required = false) String authorization,
                                           @RequestBody Map<String, String> body) {
        UUID personId = tokenService.personFromBearer(authorization);
        auth.confirmEnrolment(personId, body.get("code"));
        return ResponseEntity.noContent().build();
    }

    /** Disable requires the current password (knowledge proof). */
    @DeleteMapping(value = "/mfa", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> mfaDisable(@RequestHeader(value = "Authorization", required = false) String authorization,
                                           @RequestBody Map<String, String> body) {
        UUID personId = tokenService.personFromBearer(authorization);
        auth.disable(personId, body.get("password"));
        return ResponseEntity.noContent().build();
    }

    // ========== Token Endpoint (ROPC - legacy + auth_code - FAPI 2.0) ==========

    @PostMapping(value = "/token", consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE)
    public IdpDtos.TokenResponse token(@RequestBody Map<String, String> body,
                                        @RequestHeader(value = "DPoP", required = false) String dpopHeader) {
        String grantType = body.get("grant_type");
        
        if ("client_credentials".equals(grantType)) {
            // FAPI 2.0 machine-plane: client_credentials + private_key_jwt + DPoP
            IdpDtos.ClientCredentialsGrant grant = new IdpDtos.ClientCredentialsGrant(
                body.get("grant_type"),
                body.get("client_id"),
                body.get("client_assertion"),
                body.get("client_assertion_type"),
                body.get("scope")
            );
            return tokenService.grantClientCredentials(grant, dpopHeader);
        } else if ("password".equals(grantType)) {
            // Legacy ROPC (will be deprecated)
            IdpDtos.TokenGrant grant = new IdpDtos.TokenGrant(
                body.get("grant_type"),
                body.get("username"),
                body.get("password"),
                body.get("client_id"),
                body.get("otp")
            );
            return tokenService.grantPassword(grant);
        } else if ("authorization_code".equals(grantType)) {
            // FAPI 2.0: Authorization code flow with PKCE + DPoP + private_key_jwt
            IdpDtos.TokenExchangeRequest request = new IdpDtos.TokenExchangeRequest(
                body.get("grant_type"),
                body.get("code"),
                body.get("code_verifier"),
                body.get("redirect_uri"),
                body.get("client_assertion"),
                body.get("client_assertion_type")
            );
            
            // Consume auth code (validates PKCE)
            ParService.AuthCodeData authCodeData = parService.consumeAuthCode(request.code(), request.codeVerifier());
            
            // Exchange for token (validates client_assertion, DPoP)
            return tokenService.exchangeAuthCode(request, dpopHeader, authCodeData);
        } else {
            throw new IdpProblemException(new IdpDtos.IdpProblem(
                "UNSUPPORTED_GRANT", "grant_type must be 'password' or 'authorization_code'", 400));
        }
    }

    // ========== Existing endpoints ==========

    @GetMapping(value = "/jwks", produces = MediaType.APPLICATION_JSON_VALUE)
    public String jwks() {
        return tokenService.jwksJson();
    }

    @PostMapping(value = "/introspect", consumes = MediaType.TEXT_PLAIN_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE)
    public IdpDtos.IntrospectionResponse introspect(@RequestBody String token) {
        return tokenService.introspect(token == null ? "" : token.trim());
    }

    @PostMapping(value = "/introspect", consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE)
    public IdpDtos.IntrospectionResponse introspectJson(@RequestBody Map<String, String> body) {
        return tokenService.introspect(body.getOrDefault("token", ""));
    }

    @GetMapping(value = "/policy/{tenantId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public IdpDtos.PolicyView policy(@PathVariable("tenantId") UUID tenantId) {
        return tokenService.policy(tenantId);
    }

    @PutMapping(value = "/policy/{tenantId}", consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE)
    public IdpDtos.PolicyView updatePolicy(@PathVariable("tenantId") UUID tenantId,
                                           @RequestBody IdpDtos.PolicyUpdate update,
                                           @RequestHeader(value = "X-FSP-User-Id", required = false) String updatedBy) {
        UUID actor = null;
        if (updatedBy != null && !updatedBy.isBlank()) {
            try {
                actor = UUID.fromString(updatedBy);
            } catch (IllegalArgumentException ignored) {
                actor = null;
            }
        }
        return tokenService.updatePolicy(tenantId, update, actor);
    }

    @GetMapping(value = "/.well-known/openid-configuration", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, String> discovery() {
        return Map.of(
            "issuer", props.getIssuer(),
            "token_endpoint", "/idp/token",
            "jwks_uri", "/idp/jwks",
            "pushed_authorization_request_endpoint", "/idp/par",
            "authorization_endpoint", "/idp/authorize",
            "grant_types_supported", "authorization_code, password, client_credentials");
    }

    // ========== Internal: OAuth client management (core only) ==========

    @PostMapping(value = "/internal/clients", consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE)
    public IdpDtos.ClientView createClient(@RequestBody IdpDtos.ClientCreate body,
                                           @RequestHeader(value = "X-FSP-Internal-Credential", required = false) String credential) {
        if (credential == null || !credential.equals(props.getInternalCredential())) {
            throw new IdpProblemException(new IdpDtos.IdpProblem(
                "INTERNAL_CREDENTIAL_INVALID", "Internal credential required", 401));
        }
        if (body.clientId() == null || body.clientId().isBlank()
            || body.ownerTenantId() == null) {
            throw new IdpProblemException(new IdpDtos.IdpProblem(
                "INVALID_REQUEST", "client_id and ownerTenantId are required", 400));
        }
        // Check uniqueness via JDBC
        try {
            jdbc.queryForObject("SELECT 1 FROM oauth_clients WHERE client_id = ?",
                new Object[]{body.clientId()}, Integer.class);
            throw new IdpProblemException(new IdpDtos.IdpProblem(
                "CLIENT_EXISTS", "Client " + body.clientId() + " already registered", 409));
        } catch (org.springframework.dao.EmptyResultDataAccessException ignored) {
            // not found — good, proceed
        }
        jdbc.update("""
            INSERT INTO oauth_clients (client_id, client_type, jwks, grant_types, status, owner_tenant_id, token_ttl_s, created_at, updated_at)
            VALUES (?, 'MACHINE', ?, '["client_credentials"]', 'ACTIVE', ?, ?, now(), now())
            """, body.clientId(), body.jwks(), body.ownerTenantId(), body.tokenTtlSeconds() == null ? 300 : body.tokenTtlSeconds());
        log.info("idp_client_created clientId={} ownerTenant={}", body.clientId(), body.ownerTenantId());
        return new IdpDtos.ClientView(body.clientId(), "MACHINE", body.jwks(),
            List.of("client_credentials"), "ACTIVE", body.ownerTenantId(),
            body.tokenTtlSeconds() == null ? 300 : body.tokenTtlSeconds());
    }

    @PatchMapping(value = "/internal/clients/{clientId}", consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE)
    public IdpDtos.ClientView patchClient(@PathVariable("clientId") String clientId,
                                          @RequestBody IdpDtos.ClientUpdate body,
                                          @RequestHeader(value = "X-FSP-Internal-Credential", required = false) String credential) {
        if (credential == null || !credential.equals(props.getInternalCredential())) {
            throw new IdpProblemException(new IdpDtos.IdpProblem(
                "INTERNAL_CREDENTIAL_INVALID", "Internal credential required", 401));
        }
        var row = jdbc.queryForMap("SELECT client_id, status FROM oauth_clients WHERE client_id = ?", clientId);
        String currentStatus = (String) row.get("status");
        String newStatus = body.status() == null ? currentStatus : body.status();
        if (!Set.of("ACTIVE", "SUSPENDED", "DEACTIVATED").contains(newStatus)) {
            throw new IdpProblemException(new IdpDtos.IdpProblem(
                "INVALID_STATUS", "status must be ACTIVE, SUSPENDED or DEACTIVATED", 400));
        }
        jdbc.update("UPDATE oauth_clients SET status = ?, updated_at = now() WHERE client_id = ?",
            newStatus, clientId);
        log.info("idp_client_patched clientId={} status={} -> {}", clientId, currentStatus, newStatus);
        var updated = jdbc.queryForMap("SELECT client_id, client_type, jwks, grant_types, status, owner_tenant_id, token_ttl_s FROM oauth_clients WHERE client_id = ?", clientId);
        return new IdpDtos.ClientView(
            (String) updated.get("client_id"), (String) updated.get("client_type"),
            (String) updated.get("jwks"),
            List.of("client_credentials"), (String) updated.get("status"),
            UUID.fromString((String) updated.get("owner_tenant_id")),
            ((Number) updated.get("token_ttl_s")).intValue());
    }
}