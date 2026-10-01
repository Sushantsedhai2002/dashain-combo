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
    salePrice: { currency: "NPR", amountMinor: 5000000 },
    discovery: discovery(),
    ...overrides,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("publish failed");
  return result.value;
}
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
    await catalog.searchVisibleOffers({ minPriceMinor: 6000000, currency: "NPR" }),
  ).toMatchObject({ ok: true, value: { items: [] } });
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
