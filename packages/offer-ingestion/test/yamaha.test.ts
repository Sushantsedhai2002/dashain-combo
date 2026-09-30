import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { createYamahaAdapter } from "../src/adapters/yamaha.ts";
const r = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!r.ok) throw Error("Registry");
const source = r.sources.find((s) => s.id === "yamaha-nepal");
if (!source) throw Error("Source");
describe("dated Yamaha promotional news", () => {
  it("publishes the dated festive promotion and skips ordinary motorcycle news", async () => {
    const result = await createYamahaAdapter(async () => ({
      status: 200,
      body: await readFile(new URL("./fixtures/yamaha-nepal.html", import.meta.url), "utf8"),
    })).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      title: "Yamaha Changa Chet Jitko Naya Upgrade",
      category: "AUTOMOTIVE",
      sourcePublishedAt: { kind: "KATHMANDU_DATE", value: "2026-09-15" },
      brandName: "Yamaha",
    });
    expect(result.offers[0]?.salePrice).toBeUndefined();
    expect(result.offers[0]?.explicitValidityEnd).toBeUndefined();
  });
  it("fails closed for missing structure, fetch failure and unapproved source", async () => {
    expect(
      await createYamahaAdapter(async () => ({ status: 200, body: "<h1>Changed</h1>" })).scan(
        source,
      ),
    ).toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(await createYamahaAdapter(async () => ({ status: 403, body: "" })).scan(source)).toEqual(
      { ok: false, reason: "NETWORK_ERROR" },
    );
    expect(
      await createYamahaAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createYamahaAdapter(async () => ({ status: 200, body: "" })).scan({
        ...source,
        channels: [],
      }),
    ).toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
  });
});
