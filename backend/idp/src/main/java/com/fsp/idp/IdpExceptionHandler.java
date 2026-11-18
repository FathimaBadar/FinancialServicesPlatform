package com.fsp.idp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Problem responses for the IdP; 4xx → warn incident, 5xx → error incident (AGENTS.md §2c). */
@RestControllerAdvice
public class IdpExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(IdpExceptionHandler.class);

    @ExceptionHandler(IdpProblemException.class)
    public ResponseEntity<IdpDtos.IdpProblem> handleProblem(IdpProblemException e) {
        if (e.problem().status() >= 500) {
            log.error("idp_problem status={} code={}", e.problem().status(), e.problem().code(), e);
        } else {
            log.warn("idp_problem status={} code={} detail={}",
                e.problem().status(), e.problem().code(), e.problem().detail());
        }
        return e.toResponse();
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<IdpDtos.IdpProblem> handleUnhandled(Exception e) {
        // Spring MVC's own 4xx signals (no route / static resource, wrong method, bad media type,
        // missing param) keep their status; they are client errors, not incidents.
        if (e instanceof org.springframework.web.ErrorResponse er && er.getStatusCode().is4xxClientError()) {
            int status = er.getStatusCode().value();
            if (e instanceof org.springframework.web.servlet.resource.NoResourceFoundException) {
                log.debug("idp_no_resource detail={}", e.getMessage());
            } else {
                log.warn("idp_request_rejected status={} detail={}", status, e.getMessage());
            }
            return ResponseEntity.status(status).body(new IdpDtos.IdpProblem(
                "REQUEST_REJECTED", er.getBody().getDetail(), status));
        }
        String correlationId = org.slf4j.MDC.get("traceId");
        log.error("idp_unhandled_exception correlationId={}", correlationId, e);
        return ResponseEntity.status(500).body(new IdpDtos.IdpProblem(
            "IDP_INTERNAL_ERROR", "Internal error; the incident has been logged with the correlation id", 500));
    }
}
