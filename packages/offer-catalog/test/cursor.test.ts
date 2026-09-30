import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor, type OfferCursorKeyset } from "../src/cursor.ts";

const id = "550e8400-e29b-41d4-a716-446655440000";

const newestKeyset: OfferCursorKeyset = {
  sort: "NEWEST",
  firstDiscoveredAt: "2026-09-01T06:00:00.000Z",
  id,
};

const keysets: readonly OfferCursorKeyset[] = [
  newestKeyset,
  {
    sort: "EXPIRING_SOON",
    expiresAt: "2026-09-21T06:00:00.000Z",
    id,
  },
  { sort: "DISCOUNT_DESC", discountPercent: null, id },
  { sort: "PRICE_ASC", currency: "NPR", amountMinor: 80_000, id },
  { sort: "PRICE_DESC", currency: "NPR", amountMinor: null, id },
];

function rawCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("offer cursor codec", () => {
  it.each(keysets)("round-trips $sort keysets", (keyset) => {
    const cursor = encodeCursor(keyset);

    expect(decodeCursor(cursor, keyset.sort)).toEqual({
      ok: true,
      value: keyset,
    });
  });

  it.each(["", "not*base64", "e2JhZA", rawCursor("not-an-object")])(
    "rejects malformed cursor %s",
    (cursor) => {
      expect(decodeCursor(cursor, "NEWEST")).toEqual({
        ok: false,
        issues: [
          {
            code: "CURSOR_INVALID",
            path: "cursor",
            message: "Cursor is invalid",
          },
        ],
      });
    },
  );

  it("rejects unknown versions", () => {
    const cursor = rawCursor({ version: 2, keyset: newestKeyset });

    expect(decodeCursor(cursor, "NEWEST").ok).toBe(false);
  });

  it("rejects a cursor for another sort", () => {
    const cursor = encodeCursor(newestKeyset);

    expect(decodeCursor(cursor, "EXPIRING_SOON").ok).toBe(false);
  });

  it("rejects unsafe price values and trailing fields", () => {
    const unsafe = rawCursor({
      version: 1,
      keyset: {
        sort: "PRICE_ASC",
        currency: "NPR",
        amountMinor: Number.MAX_SAFE_INTEGER + 1,
        id,
        extra: true,
      },
    });

    expect(decodeCursor(unsafe, "PRICE_ASC").ok).toBe(false);
  });

  it("rejects a cursor from another price currency", () => {
    const cursor = encodeCursor({
      sort: "PRICE_ASC",
      currency: "USD",
      amountMinor: 100,
      id,
    });

    expect(decodeCursor(cursor, "PRICE_ASC", "NPR").ok).toBe(false);
  });
});
