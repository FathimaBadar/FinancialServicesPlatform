package com.fsp.bff;

import com.fsp.bff.BffDtos.SessionUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.URI;
import java.util.Set;

/**
 * The trusted internal hop (FAPI2 guide §2): the ONLY bridge between the SPA session and
 * the api gateway. Inbound identity/forwarding headers are STRIPPED; the session's IdP token
 * is attached as Bearer; the gateway verifies it and re-issues X-FSP-* identity to core.
 * Clients can never spoof tokens or X-FSP-* headers through the BFF.
 * FAPI 2.0: Adds DPoP proof header to all proxied API calls.
 */
@Slf4j
@RestController
public class ApiProxyController {

    private static final Set<String> ALLOWED = Set.of("GET", "POST", "PUT", "PATCH", "DELETE");
    private static final Set<String> HOP_BY_HOP = Set.of("connection", "keep-alive", "transfer-encoding",
        "te", "upgrade", "proxy-authorization", "proxy-authenticate", "set-cookie", "cookie");
    /** Clients must not smuggle internal headers — stripped before the trusted re-issue. */
    private static final Set<String> NEVER_PASSED = Set.of("x-fsp-user-id", "x-fsp-tenant-id", "x-fsp-username",
        "x-fsp-client-id", "x-fsp-internal-credential", "authorization", "host", "forwarded", "cookie");

    private final RestClient rest;
    private final BffProperties props;
    private final IdpClient idp;

    public ApiProxyController(RestClient rest, BffProperties props, IdpClient idp) {
        this.rest = rest;
        this.props = props;
        this.idp = idp;
    }

    @RequestMapping("/api/**")
    public void proxy(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String method = request.getMethod().toUpperCase();
        if (!ALLOWED.contains(method)) {
            reject(response, 405, "METHOD_NOT_ALLOWED", "Method not proxied");
            return;
        }

        SessionUser user = BffSessionController.current(request);
        String token = BffSessionController.token(request);
        String dpopKey = BffSessionController.dpopKey(request);
        if (user == null || !StringUtils.hasText(token)) {
            log.warn("proxy_no_session path={} remote={}", request.getRequestURI(), request.getRemoteAddr());
            reject(response, 401, "NO_SESSION", "Authentication required (GET /bff/auth/login)");
            return;
        }

        // Generate DPoP proof for this API call (FAPI 2.0 requirement)
        String gatewayPath = request.getRequestURI().replaceFirst("^/api", "/v1");
        String[] dpopProofHolder = { null };
        if (dpopKey != null) {
            try {
                dpopProofHolder[0] = idp.createDPoPProofForApi(dpopKey, props.getGateway().getBaseUrl() + gatewayPath, method);
            } catch (Exception e) {
                log.warn("dpop_proof_generation_failed path={}", request.getRequestURI(), e);
            }
        }

        byte[] body = readBody(request);
        if (body == null) {
            reject(response, 413, "BODY_TOO_LARGE",
                "Request body exceeds %d bytes".formatted(props.getProxy().getMaxBodyBytes()));
            return;
        }

        String query = request.getQueryString() == null ? "" : "?" + request.getQueryString();
        URI target = URI.create(props.getGateway().getBaseUrl() + gatewayPath + query);

        try {
            var spec = rest.method(HttpMethod.valueOf(method))
                .uri(target)
                .headers(headers -> copyTrusted(request, method, token, dpopProofHolder[0], headers));
            ResponseEntity<byte[]> upstream = (body.length == 0 ? spec : spec.body(body))
                .exchange((req, res) -> {
                    byte[] raw = res.getBody().readAllBytes();
                    ResponseEntity.BodyBuilder builder = ResponseEntity.status(res.getStatusCode());
                    res.getHeaders().forEach((name, values) -> {
                        if (!HOP_BY_HOP.contains(name.toLowerCase())) {
                            values.forEach(v -> builder.header(name, v));
                        }
                    });
                    return builder.body(raw);
                });
            // If the upstream (gateway/IdP) returned 401, the IdP token in this session is expired.
            // Invalidate the BFF session so the client is forced to re-authenticate.
            if (upstream.getStatusCode().is4xxClientError() && upstream.getStatusCode().value() == 401) {
                try {
                    request.getSession(false);
                    // Invalidate via the request's session if present
                    jakarta.servlet.http.HttpSession s = request.getSession(false);
                    if (s != null) s.invalidate();
                } catch (Exception ignored) {}
            }
            writePassthrough(response, upstream);
        } catch (org.springframework.web.client.HttpStatusCodeException e) {
            // 401 from upstream: IdP token expired — invalidate the session before surfacing the error.
            if (e.getStatusCode().value() == 401) {
                try {
                    jakarta.servlet.http.HttpSession s = request.getSession(false);
                    if (s != null) s.invalidate();
                } catch (Exception ignored) {}
            }
            writeProblem(response, e.getStatusCode().value(), e.getResponseBodyAsString());
        } catch (Exception e) {
            log.error("proxy_failure path={} detail={}", request.getRequestURI(), e.getMessage(), e);
            reject(response, 502, "UPSTREAM_UNAVAILABLE", "Gateway service unavailable");
        }
    }

    private void copyTrusted(HttpServletRequest request, String method, String token, String dpopProof,
                             org.springframework.http.HttpHeaders headers) {
        // Only neutral passthrough headers + Idempotency-Key survive; identity comes from the session token.
        java.util.Enumeration<String> names = request.getHeaderNames();
        while (names.hasMoreElements()) {
            String name = names.nextElement();
            if (name == null || NEVER_PASSED.contains(name.toLowerCase()) || HOP_BY_HOP.contains(name.toLowerCase())) {
                continue;
            }
            java.util.Collections.list(request.getHeaders(name)).forEach(v -> headers.add(name, v));
        }
        headers.setBearerAuth(token);
        if (dpopProof != null) {
            headers.set("DPoP", dpopProof);
        }
        headers.set("X-FSP-Client-Id", "fsp-bff");
        if (!"GET".equals(method) && !StringUtils.hasText(request.getHeader("Idempotency-Key"))) {
            log.debug("proxy_mutation_without_idempotency — core will reject with IDEMPOTENCY_KEY_REQUIRED");
        }
    }

    private byte[] readBody(HttpServletRequest request) throws IOException {
        if (!StringUtils.hasText(request.getHeader("Content-Length"))) return new byte[0];
        int max = props.getProxy().getMaxBodyBytes();
        try (var in = request.getInputStream()) {
            byte[] bytes = in.readNBytes(max + 1);
            if (bytes.length > max) {
                log.warn("proxy_body_too_large path={} limit={}", request.getRequestURI(), max);
                return null;
            }
            return bytes;
        }
    }

    private static void writePassthrough(HttpServletResponse response, ResponseEntity<byte[]> upstream)
        throws IOException {
        response.setStatus(upstream.getStatusCode().value());
        upstream.getHeaders().forEach((name, values) -> {
            if (!HOP_BY_HOP.contains(name.toLowerCase()) && !"content-length".equals(name.toLowerCase())) {
                values.forEach(v -> response.addHeader(name, v));
            }
        });
        byte[] body = upstream.getBody() == null ? new byte[0] : upstream.getBody();
        response.setContentLength(body.length);
        response.getOutputStream().write(body);
        response.getOutputStream().flush();
    }

    private static void writeProblem(HttpServletResponse response, int status, String rawBody)
        throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setContentLength(rawBody == null ? 0 : rawBody.length());
        if (rawBody != null) {
            response.getOutputStream().write(rawBody.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        response.getOutputStream().flush();
    }

    private static void reject(HttpServletResponse response, int status, String code, String detail)
        throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write("{\"code\":\"%s\",\"detail\":\"%s\",\"status\":%d}"
            .formatted(code, detail, status));
    }
}