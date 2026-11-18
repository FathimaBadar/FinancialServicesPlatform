package com.fsp.core.journal;

import com.fsp.core.common.HashUtil;
import com.fsp.core.common.Uuid5;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Direct debit-to-credit matching (PRD §3.6 / vision.md §5.4). Pure static functions — property tested.
 *
 * Properties (asserted by tests):
 *  1. per-account gross DEBIT turnover emitted == sum of that account's DEBIT lines,
 *  2. per-account gross CREDIT turnover emitted == sum of its CREDIT lines,
 *  3. every leg is itself a balanced debit/credit pair,
 *  4. deterministic leg ids from (entryId, legIndex) — retries reproduce identical ids,
 *  5. all legs carry the linked flag except the final leg,
 *  6. at most (#debitLines + #creditLines − 1) legs,
 *  7. same account on both sides is rejected explicitly.
 */
public final class PostingPlanner {

    private PostingPlanner() {}

    public record LineSpec(int lineNo, UUID glAccountId, String direction, long amount) {}

    public record PlannedLeg(int legIndex, UUID transferId, UUID debitAccountId, UUID creditAccountId,
                             long amount, boolean linked) {}

    public record Plan(UUID entryId, long total, List<PlannedLeg> legs, String planHash) {}

    /** Thrown only for input violations; the application layer maps it to a 4xx problem. */
    public static final class JeInvariantException extends RuntimeException {
        public JeInvariantException(String msg) { super(msg); }
    }

    public static Plan plan(UUID entryId, List<LineSpec> lines) {
        if (lines == null || lines.size() < 2) {
            throw new JeInvariantException("Journal entry requires at least 2 lines");
        }

        List<LineSpec> debits = lines.stream()
            .filter(l -> Direction.DEBIT.name().equals(l.direction()))
            .sorted(Comparator.comparingInt(LineSpec::lineNo))
            .toList();
        List<LineSpec> credits = lines.stream()
            .filter(l -> Direction.CREDIT.name().equals(l.direction()))
            .sorted(Comparator.comparingInt(LineSpec::lineNo))
            .toList();

        if (debits.isEmpty() || credits.isEmpty()) {
            throw new JeInvariantException("Journal entry requires both debit and credit lines");
        }

        // Same account on both sides is rejected explicitly (vision.md §5.4).
        List<UUID> debitAccounts = debits.stream().map(LineSpec::glAccountId).distinct().toList();
        List<UUID> creditAccounts = credits.stream().map(LineSpec::glAccountId).distinct().toList();
        creditAccounts.stream().filter(debitAccounts::contains)
            .findFirst()
            .ifPresent(a -> { throw new JeInvariantException("Same GL account on both sides is not allowed: " + a); });

        long debitsTotal = debits.stream().mapToLong(LineSpec::amount).sum();
        long creditsTotal = credits.stream().mapToLong(LineSpec::amount).sum();
        if (debitsTotal == 0 || debitsTotal != creditsTotal) {
            throw new JeInvariantException("Journal entry not balanced: debits=%d credits=%d".formatted(debitsTotal, creditsTotal));
        }

        long[] debitRemaining = debits.stream().mapToLong(LineSpec::amount).toArray();
        long[] creditRemaining = credits.stream().mapToLong(LineSpec::amount).toArray();
        int d = 0, c = 0, legIndex = 0;
        List<PlannedLeg> legs = new ArrayList<>();

        while (d < debits.size() && c < credits.size()) {
            long amount = Math.min(debitRemaining[d], creditRemaining[c]);
            legs.add(new PlannedLeg(legIndex,
                Uuid5.transferId(entryId, legIndex),
                debits.get(d).glAccountId(),
                credits.get(c).glAccountId(),
                amount,
                true));
            debitRemaining[d] -= amount;
            creditRemaining[c] -= amount;
            if (debitRemaining[d] == 0) d++;
            if (creditRemaining[c] == 0) c++;
            legIndex++;
        }

        // Only the final leg of the chain is unlinked.
        List<PlannedLeg> fixed = new ArrayList<>(legs.size());
        for (int i = 0; i < legs.size(); i++) {
            PlannedLeg l = legs.get(i);
            fixed.add(new PlannedLeg(l.legIndex(), l.transferId(), l.debitAccountId(),
                l.creditAccountId(), l.amount(), i < legs.size() - 1));
        }

        String planHash = HashUtil.sha256Hex(canonical(entryId, fixed));
        return new Plan(entryId, debitsTotal, List.copyOf(fixed), planHash);
    }

    public static String canonical(UUID entryId, List<PlannedLeg> legs) {
        StringBuilder sb = new StringBuilder("je=").append(entryId).append(";legs=");
        for (PlannedLeg l : legs) {
            sb.append(l.legIndex()).append(':').append(l.transferId())
                .append(':').append(l.debitAccountId())
                .append(':').append(l.creditAccountId())
                .append(':').append(l.amount())
                .append(':').append(l.linked() ? 'L' : '-')
                .append(';');
        }
        return sb.toString();
    }

    /** Property-test helper: gross debit turnover per account emitted by the plan. */
    public static Map<UUID, Long> grossDebits(List<PlannedLeg> legs) {
        Map<UUID, Long> sums = new LinkedHashMap<>();
        for (PlannedLeg leg : legs) sums.merge(leg.debitAccountId(), leg.amount(), Long::sum);
        return sums;
    }

    /** Property-test helper: gross credit turnover per account emitted by the plan. */
    public static Map<UUID, Long> grossCredits(List<PlannedLeg> legs) {
        Map<UUID, Long> sums = new LinkedHashMap<>();
        for (PlannedLeg leg : legs) sums.merge(leg.creditAccountId(), leg.amount(), Long::sum);
        return sums;
    }

    public enum Direction { DEBIT, CREDIT }
}
