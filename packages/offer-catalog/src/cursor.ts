import { z } from "zod";

import type { CatalogResult, OfferSort } from "./contract.ts";

export type OfferCursorKeyset =
  | Readonly<{
      sort: "NEWEST";
      firstDiscoveredAt: string;
      id: string;
    }>
  | Readonly<{
      sort: "EXPIRING_SOON";
      expiresAt: string;
      id: string;
    }>
  | Readonly<{
      sort: "DISCOUNT_DESC";
      discountPercent: number | null;
      id: string;
    }>
  | Readonly<{
      sort: "PRICE_ASC" | "PRICE_DESC";
      currency: string;
      amountMinor: number | null;
      id: string;
    }>;

const IdSchema = z.uuid();
const InstantSchema = z.iso.datetime({ offset: true });
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);

const KeysetSchema = z.discriminatedUnion("sort", [
  z
    .object({
      sort: z.literal("NEWEST"),
      firstDiscoveredAt: InstantSchema,
      id: IdSchema,
    })
    .strict(),
  z
    .object({
      sort: z.literal("EXPIRING_SOON"),
      expiresAt: InstantSchema,
      id: IdSchema,
    })
    .strict(),
  z
    .object({
      sort: z.literal("DISCOUNT_DESC"),
      discountPercent: z.number().min(0).max(100).nullable(),
      id: IdSchema,
    })
    .strict(),
  z
    .object({
      sort: z.literal("PRICE_ASC"),
      currency: CurrencySchema,
      amountMinor: z.number().int().nonnegative().safe().nullable(),
      id: IdSchema,
    })
    .strict(),
  z
    .object({
      sort: z.literal("PRICE_DESC"),
      currency: CurrencySchema,
      amountMinor: z.number().int().nonnegative().safe().nullable(),
      id: IdSchema,
    })
    .strict(),
]);

const CursorPayloadSchema = z
  .object({
    version: z.literal(1),
    keyset: KeysetSchema,
  })
  .strict();

function invalidCursor(): CatalogResult<OfferCursorKeyset> {
  return Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({
        code: "CURSOR_INVALID",
        path: "cursor",
        message: "Cursor is invalid",
      }),
    ]),
  });
}

export function encodeCursor(keyset: OfferCursorKeyset): string {
  const parsed = KeysetSchema.safeParse(keyset);
  if (!parsed.success) throw new TypeError("Invalid offer cursor keyset");

  return Buffer.from(JSON.stringify({ version: 1, keyset: parsed.data }), "utf8").toString(
    "base64url",
  );
}

export function decodeCursor(
  cursor: string,
  expectedSort: OfferSort,
  expectedCurrency?: string,
): CatalogResult<OfferCursorKeyset> {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return invalidCursor();

    const buffer = Buffer.from(cursor, "base64url");
    if (buffer.toString("base64url") !== cursor) return invalidCursor();

    const parsedJson: unknown = JSON.parse(buffer.toString("utf8"));
    const parsed = CursorPayloadSchema.safeParse(parsedJson);
    if (!parsed.success || parsed.data.keyset.sort !== expectedSort) {
      return invalidCursor();
    }

    const keyset = parsed.data.keyset;
    if (
      expectedCurrency !== undefined &&
      (keyset.sort === "PRICE_ASC" || keyset.sort === "PRICE_DESC") &&
      keyset.currency !== expectedCurrency
    ) {
      return invalidCursor();
    }

    return Object.freeze({ ok: true, value: Object.freeze(keyset) });
  } catch {
    return invalidCursor();
  }
}
