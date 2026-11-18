package com.fsp.core.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Deterministic UUIDv5: same input must always produce the same id (TB transfer id determinism). */
class Uuid5Test {

    @Test
    void deterministic() {
        UUID a = Uuid5.transferId(UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), 0);
        UUID b = Uuid5.transferId(UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), 0);
        assertThat(a).isEqualTo(b);
        assertThat(a.version()).isEqualTo(5);
    }

    @Test
    void differentLegDifferentId() {
        UUID entry = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        assertThat(Uuid5.transferId(entry, 0)).isNotEqualTo(Uuid5.transferId(entry, 1));
    }

    @Test
    void differentEntryDifferentId() {
        UUID e1 = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        UUID e2 = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        assertThat(Uuid5.transferId(e1, 0)).isNotEqualTo(Uuid5.transferId(e2, 0));
    }

    @Test
    void fromNameStable() {
        assertThat(Uuid5.fromName("entry-123:0")).isEqualTo(Uuid5.fromName("entry-123:0"));
    }
}
