package com.fsp.core.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * RFC-7807 mapping. Every handled negative path is incident-logged (AGENTS.md §2c):
 * 4xx business failures at WARN, 5xx / unhandled at ERROR with the exception attached.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ProblemDetail handleApi(ApiException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(e.getStatus(), e.getMessage());
        pd.setProperty("code", e.getCode());
        String corr = RequestCorrelation.currentCorrelation();
        if (corr != null) pd.setProperty("correlationId", corr);
        if (e.getStatus().is5xxServerError()) {
            log.error("api_error code={} status={} detail={}", e.getCode(), e.getStatus().value(), e.getMessage(), e);
        } else {
            log.warn("api_rejected code={} status={} detail={}", e.getCode(), e.getStatus().value(), e.getMessage());
        }
        return pd;
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ProblemDetail handleNotFound(NoResourceFoundException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Resource not found");
        pd.setProperty("code", "NOT_FOUND");
        log.warn("api_rejected code=NOT_FOUND status=404 path-unknown");
        return pd;
    }

    /** A concurrent writer won the optimistic-lock race (AGENTS §2d): the client must reload. */
    @ExceptionHandler(org.springframework.dao.OptimisticLockingFailureException.class)
    public ProblemDetail handleStale(org.springframework.dao.OptimisticLockingFailureException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
            "This record was changed by someone else; reload and try again");
        pd.setProperty("code", "STALE_WRITE");
        String corr = RequestCorrelation.currentCorrelation();
        if (corr != null) pd.setProperty("correlationId", corr);
        log.warn("api_rejected code=STALE_WRITE status=409 detail={}", e.getMessage());
        return pd;
    }

    /** Malformed / unparseable JSON body is a client error, not an incident. */
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadable(org.springframework.http.converter.HttpMessageNotReadableException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request body is not valid JSON for this operation");
        pd.setProperty("code", "BODY_INVALID");
        String corr = RequestCorrelation.currentCorrelation();
        if (corr != null) pd.setProperty("correlationId", corr);
        // the parser's own reason (no source excerpt → no request content/PII in logs)
        Throwable cause = e.getMostSpecificCause();
        String reason = cause instanceof tools.jackson.core.JacksonException je ? je.getOriginalMessage()
            : cause.getClass().getSimpleName();
        log.warn("api_rejected code=BODY_INVALID status=400 reason={}", reason);
        return pd;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnhandled(Exception e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
            "Internal error; the incident has been logged with the correlation id");
        String corr = RequestCorrelation.currentCorrelation();
        if (corr != null) pd.setProperty("correlationId", corr);
        log.error("unhandled_exception correlationId={}", corr, e);
        return pd;
    }
}
