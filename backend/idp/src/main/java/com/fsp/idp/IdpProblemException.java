package com.fsp.idp;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/** IdP problem carrier — mirrors core's ApiException + ProblemDetail code/detail convention. */
public class IdpProblemException extends RuntimeException {
    private final IdpDtos.IdpProblem problem;

    public IdpProblemException(IdpDtos.IdpProblem problem) {
        super(problem.code() + ": " + problem.detail());
        this.problem = problem;
    }

    public IdpDtos.IdpProblem problem() {
        return problem;
    }

    public ResponseEntity<IdpDtos.IdpProblem> toResponse() {
        return ResponseEntity.status(HttpStatus.valueOf(problem.status())).body(problem);
    }
}
