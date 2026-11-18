package com.fsp.core.journal;

import java.util.List;
import java.util.UUID;

/** Sealed posting outcome — consumed by JournalService to drive the state machine. */
public sealed interface PostingOutcome {

    /** TigerBeetle committed all linked legs of the plan. */
    record Committed(String planHash, List<UUID> transferIds) implements PostingOutcome {}

    /** TigerBeetle gave a definitive rejection — terminal REJECTED. */
    record Rejected(String detail) implements PostingOutcome {}

    /** Transport lost or test-injected — outcome uncertain (COMMIT_UNKNOWN). */
    record Unknown(String detail) implements PostingOutcome {}
}
