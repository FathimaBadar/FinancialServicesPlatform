package com.fsp.core.common;

import java.util.UUID;

/**
 * Deterministic UUIDv5 (namespace-style) derivation used for TigerBeetle ids so that
 * retries reproduce identical ids (PRD §3.6 / vision.md §5.4).
 */
public final class Uuid5 {

    /** Platform namespace — fixed for Phase-0; document before changing (breaks TB ids). */
    public static final UUID FSP_NAMESPACE = UUID.fromString("a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d");

    private Uuid5() {}

    public static UUID fromName(String name) {
        return fromNamespace(FSP_NAMESPACE, name);
    }

    public static UUID glAccountId(UUID bookId, UUID glId) {
        return fromName(bookId + ":" + glId);
    }

    public static UUID transferId(UUID entryId, int legIndex) {
        return fromName(entryId + ":" + legIndex);
    }

    // Standard SHA-1 based UUIDv5
    public static UUID fromNamespace(UUID namespace, String name) {
        try {
            var md = java.security.MessageDigest.getInstance("SHA-1");
            byte[] nsBytes = toBytes(namespace);
            byte[] nameBytes = name.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            md.update(nsBytes);
            md.update(nameBytes);
            byte[] hash = md.digest();
            hash[6] &= 0x0F;
            hash[6] |= 0x50;          // version 5
            hash[8] &= 0x3F;
            hash[8] |= 0x80;          // RFC 4122 variant
            long msb = 0, lsb = 0;
            for (int i = 0; i < 8; i++) msb = (msb << 8) | (hash[i] & 0xff);
            for (int i = 8; i < 16; i++) lsb = (lsb << 8) | (hash[i] & 0xff);
            return new UUID(msb, lsb);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-1 unavailable", e);
        }
    }

    private static byte[] toBytes(UUID u) {
        long msb = u.getMostSignificantBits();
        long lsb = u.getLeastSignificantBits();
        byte[] out = new byte[16];
        for (int i = 0; i < 8; i++) out[i] = (byte) (msb >>> (8 * (7 - i)));
        for (int i = 8; i < 16; i++) out[i] = (byte) (lsb >>> (8 * (15 - i)));
        return out;
    }
}
