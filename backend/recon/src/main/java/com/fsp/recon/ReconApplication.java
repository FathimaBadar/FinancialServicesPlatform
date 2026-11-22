package com.fsp.recon;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * recon-worker (no port) — chapter 13 Stage 0 SKELETON. Read-only: runs the invariant
 * checks per book and cross-book and pages on violation (plan §11 Stage 6 wires the real
 * feeds and the notification dispatch). No own database; no mutation of any book.
 */
@SpringBootApplication
@EnableScheduling
public class ReconApplication {
    private static final Logger log = LoggerFactory.getLogger(ReconApplication.class);

    public static void main(String[] args) {
        SpringApplication.run(ReconApplication.class, args);
    }
}
