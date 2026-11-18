package com.fsp.core.journal;

import static org.assertj.core.api.Assertions.assertThat;

import com.fsp.core.journal.JournalTx.Snapshot;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Recovery outbox payloads must be valid JSON (no "RECOVERY:" prefix). No DB needed. */
class JournalTxRecoveryTest {

    private static final UUID ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID TENANT = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID BOOK = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final UUID MAKER = UUID.fromString("33333333-3333-3333-3333-333333333333");
    private static final UUID CHECKER = UUID.fromString("44444444-4444-4444-4444-444444444444");

    @Test
    void snapshotPayloadIsValidJsonWithoutRecoveryPrefix() {
        Snapshot snap = new Snapshot(ID, TENANT, BOOK, "NAD", "FINALIZED",
            "plan-hash-123", List.of("tid-1", "tid-2"), MAKER, CHECKER, Instant.now(), 1L);
        String payload = snap.payload();
        // Must be valid JSON object
        assertThat(payload).startsWith("{");
        assertThat(payload).endsWith("}");
        // Must NOT start with the invalid "RECOVERY:" prefix
        assertThat(payload).doesNotStartWith("RECOVERY:");
        // Must contain expected fields
        assertThat(payload).contains("\"entryId\"");
        assertThat(payload).contains("\"status\"");
        assertThat(payload).contains("\"FINALIZED\"");
    }
}
