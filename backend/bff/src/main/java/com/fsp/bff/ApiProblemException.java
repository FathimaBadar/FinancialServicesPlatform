package com.fsp.bff;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/** Carries a ProblemDetail (from IdP, gateway or core through the gateway) with its original status. */
public class ApiProblemException extends RuntimeException {

    private final ProblemDetail problem;

    public ApiProblemException(ProblemDetail problem) {
        super(String.valueOf(problem.getProperties() == null ? null : problem.getProperties().get("code")));
        this.problem = problem;
    }

    public ApiProblemException(String code, String detail, int status) {
        this(problemOf(code, detail, status));
    }

    private static ProblemDetail problemOf(String code, String detail, int status) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(
            HttpStatus.valueOf(status >= 400 && status <= 599 ? status : 500), detail);
        pd.setProperty("code", code);
        return pd;
    }

    public ProblemDetail problem() {
        return problem;
    }

    public HttpStatus status() {
        return HttpStatus.valueOf(problem.getStatus());
    }
}
