import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeEach, expect, it } from "vitest";
import { buildOfferCatalog } from "../../src/catalog.ts";
import { PostgresOfferRepository } from "../../src/postgres/offer-repository.ts";
import { runMigrations } from "../../src/postgres/migrate.ts";
import { discovery } from "../fixtures/discovery.ts";
import { textOnlyOffer } from "../fixtures/offers.ts";
import { testDatabaseUrl } from "./integration-environment.ts";
const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
let now = new Date("2026-10-01T07:00:00Z");
const catalog = buildOfferCatalog(new PostgresOfferRepository(pool), { clock: () => now });
beforeEach(async () => {
  now = new Date("2026-10-01T07:00:00Z");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await runMigrations({
    pool,
    migrationsDirectory: fileURLToPath(new URL("../../migrations/", import.meta.url)),
  });
});
afterAll(async () => {
  await pool.end();
});
async function publish(key: string, overrides = {}) {
  const result = await catalog.publishOffer({
    ...textOnlyOffer,
    sourceOfferKey: key,
    title: "LG Washing machine",
    productName: "Washing machine",
    brandName: "LG",
    originalPrice: { currency: "NPR", amountMinor: 6000000 },
    salePrice: { currency: "NPR", amountMinor: 5000000 },
    discovery: discovery(),
    ...overrides,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("publish failed");
  return result.value;
}
it("stores furniture prices and compares complete long variant identities", async () => {
  const variant =
    "Acer Nitro 16S AI | Ryzen AI 7 350 | 16GB DDR5 | 1TB SSD | RTX 5070 Ti 12GB | 16 inch WQXGA 180Hz | Windows 11 | Warranty "
      .repeat(3)
      .trim();
  const d = discovery();
  const product = await publish("furniture-long-variant", {
    category: "HOME_AND_FURNITURE",
    discovery: discovery({ product: { ...d.product!, variant } }),
  });
  const result = await catalog.searchVisibleOffers({
    scope: "DASHAIN",
    model: d.product!.model,
    variant,
    categories: ["HOME_AND_FURNITURE"],
  });
  expect(result.ok && result.value.items.map((o) => o.id)).toEqual([product.id]);
  expect(
    await catalog.searchVisibleOffers({
      scope: "DASHAIN",
      model: d.product!.model,
      variant: variant.slice(0, 200),
    }),
  ).toMatchObject({ ok: true, value: { items: [] } });
  const history = await pool.query(
    "SELECT amount_minor, reference_amount_minor FROM offer_price_observations WHERE offer_id = $1",
    [product.id],
  );
  expect(history.rows).toEqual([{ amount_minor: "5000000", reference_amount_minor: "6000000" }]);
});
it("round trips combos and isolates old, generic, quarantined and stale records", async () => {
  const product = await publish("current");
  await publish("generic", { discovery: null });
  const d = discovery();
  await publish("old", {
    discovery: discovery({ campaign: { ...d.campaign!, seasonAD: 2025, seasonBS: "2082" } }),
  });
  await publish("quarantine", { discovery: discovery({ qualification: "QUARANTINED" }) });
  await publish("stale", { discovery: discovery({ lastVerifiedAt: "2026-09-25T00:00:00Z" }) });
  expect(await catalog.searchVisibleOffers({ scope: "DASHAIN" })).toMatchObject({
    ok: true,
    value: {
      items: [{ id: product.id, discovery: { components: [{ quantity: 1 }, { quantity: 4 }] } }],
    },
  });
  const all = await catalog.searchVisibleOffers({ scope: "ALL" });
  expect(all.ok && all.value.items.length).toBe(4);
  const repeat = await publish("current");
  expect(repeat.id).toBe(product.id);
  expect(repeat.firstDiscoveredAt).toBe(product.firstDiscoveredAt);
  now = new Date("2026-10-04T07:00:00Z");
  expect(await catalog.searchVisibleOffers({ scope: "DASHAIN" })).toMatchObject({
    ok: true,
    value: { items: [] },
  });
});
it("finds aliases, reordered tokens, exact models and budget-qualified product prices", async () => {
  const product = await publish("gift");
  await publish("unknown-price", { salePrice: null });
  for (const text of [
    "combo LG washer",
    "LG washing machine under 60k",
    "LG-123",
    "washer LG",
    "washing meshin LG",
  ]) {
    const result = await catalog.searchVisibleOffers({
      text,
      scope: "DASHAIN",
      maxPriceMinor: 6000000,
      currency: "NPR",
    });
    expect(result).toMatchObject({ ok: true, value: { items: [{ id: product.id }] } });
  }
  expect(await catalog.searchVisibleOffers({ brands: ["Samsung"] })).toMatchObject({
    ok: true,
    value: { items: [] },
  });
  expect(await catalog.searchVisibleOffers({ availability: "IN_STOCK" })).toMatchObject({
    ok: true,
    value: { items: [] },
  });
  expect(await catalog.searchVisibleOffers({ offerTypes: ["BUNDLE"] })).toMatchObject({
    ok: true,
    value: { items: [] },
  });
  expect(
    await catalog.searchVisibleOffers({
      scope: "DASHAIN",
      minPriceMinor: 6000000,
      currency: "NPR",
    }),
  ).toMatchObject({ ok: true, value: { items: [] } });
});
it("requires a fresh evidenced NPR reduction while retaining discounted gifts", async () => {
  const product = await publish("valid-gift");
  await publish("equal-price", { salePrice: { currency: "NPR", amountMinor: 6000000 } });
  await publish("no-reference-price", { originalPrice: null });
  await publish("gift-only", { originalPrice: null, salePrice: null });
  await publish("out-of-stock", { discovery: discovery({ availability: "OUT_OF_STOCK" }) });
  await publish("old-price", { discovery: discovery({ priceObservedAt: "2026-09-29T07:00:00Z" }) });
  await publish("unknown-price-time", { discovery: discovery({ priceObservedAt: null }) });
  await publish("future-price", {
    discovery: discovery({ priceObservedAt: "2026-10-02T07:00:00Z" }),
  });
  await publish("old-evidence", {
    discovery: discovery({
      evidence: discovery().evidence.map((e) => ({ ...e, fetchedAt: "2026-09-29T07:00:00Z" })),
    }),
  });
  await publish("prize", { discovery: discovery({ offerType: "PRIZE_DRAW" }) });
  await publish("expired-campaign", {
    discovery: discovery({ campaign: { ...discovery().campaign!, endsAt: now.toISOString() } }),
  });
  await publish("future-campaign", {
    discovery: discovery({
      campaign: { ...discovery().campaign!, startsAt: "2026-10-02T07:00:00Z" },
    }),
  });
  const result = await catalog.searchVisibleOffers({ scope: "DASHAIN" });
  expect(result.ok && result.value.items.map((offer) => offer.id)).toEqual([product.id]);
  // Persisted legacy evidence may predate stricter validation; the query still guards it.
  await pool.query(
    'UPDATE offers SET discovery = jsonb_set(discovery, \'{evidence,0,fields}\', \'["campaign","membership","product"]\') WHERE id = $1',
    [product.id],
  );
  expect(await catalog.searchVisibleOffers({ scope: "DASHAIN" })).toMatchObject({
    ok: true,
    value: { items: [] },
  });
});
it("keeps ranked cursors bound to filters and records price observations", async () => {
  await publish("a");
  await publish("b");
  await publish("c");
  const first = await catalog.searchVisibleOffers({ text: "washer", limit: 1, scope: "DASHAIN" });
  if (!first.ok || !first.value.nextCursor) throw new Error("Missing cursor");
  const second = await catalog.searchVisibleOffers({
    text: "washer",
    limit: 1,
    scope: "DASHAIN",
    cursor: first.value.nextCursor,
  });
  expect(second.ok && second.value.items[0]?.id).not.toBe(first.value.items[0]?.id);
  expect(
    await catalog.searchVisibleOffers({
      text: "washer",
      limit: 1,
      scope: "ALL",
      cursor: first.value.nextCursor,
    }),
  ).toMatchObject({ ok: false, issues: [{ code: "CURSOR_INVALID" }] });
  expect(
    (await pool.query("SELECT count(*)::int AS count FROM offer_price_observations")).rows[0].count,
  ).toBe(3);
  const changed = await publish("a", {
    salePrice: { currency: "NPR", amountMinor: 4900000 },
    discovery: discovery({ benefits: [] }),
  });
  expect(changed.salePrice?.amountMinor).toBe(4900000);
  expect(changed.discovery?.benefits).toEqual([]);
});

it("filters campaign membership before pagination and preserves it on the next page", async () => {
  const firstProduct = await publish("first-dashain");
  const secondProduct = await publish("second-dashain");
  await publish("generic-sale", { discovery: null });
  await publish("tihar-only", {
    discovery: discovery({ campaign: { ...discovery().campaign!, festivals: ["TIHAR"] } }),
  });
  const first = await catalog.searchVisibleOffers({ scope: "DASHAIN", limit: 1 });
  if (!first.ok || !first.value.nextCursor) throw new Error("Missing Dashain cursor");
  expect(first.value.items).toHaveLength(1);
  const second = await catalog.searchVisibleOffers({
    scope: "DASHAIN",
    limit: 1,
    cursor: first.value.nextCursor,
  });
  if (!second.ok) throw new Error("Second Dashain page failed");
  expect(second.value.items).toHaveLength(1);
  expect(second.value.nextCursor).toBeNull();
  expect(new Set([...first.value.items, ...second.value.items].map((offer) => offer.id))).toEqual(
    new Set([firstProduct.id, secondProduct.id]),
  );
});
