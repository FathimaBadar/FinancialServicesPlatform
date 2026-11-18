package com.fsp.core.rbac;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fsp.core.common.Actor;
import com.fsp.core.common.ApiException;
import org.junit.jupiter.api.Test;

import java.util.UUID;

/** Unit tests for four-eyes at person_id: maker can never check their own request. */
class PermissionServiceFourEyesTest {

    private static final Actor ALICE = new Actor(
        UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), "alice",
        UUID.fromString("11111111-1111-1111-1111-111111111111"));
    private static final Actor BOB = new Actor(
        UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "bob",
        UUID.fromString("11111111-1111-1111-1111-111111111111"));

    @Test
    void distinctPersonsAllowed() {
        PermissionService svc = new PermissionService(null, null, null, null, null, null);
        // requireDistinctPerson only compares personIds; no repository needed
        svc.requireDistinctPerson(ALICE, BOB.personId()); // should not throw
    }

    @Test
    void samePersonRejected() {
        PermissionService svc = new PermissionService(null, null, null, null, null, null);
        assertThatThrownBy(() -> svc.requireDistinctPerson(ALICE, ALICE.personId()))
            .isInstanceOf(ApiException.class)
            .satisfies(e -> assertThat(((ApiException) e).getCode()).isEqualTo("MAKER_CANNOT_APPROVE"));
    }
}
