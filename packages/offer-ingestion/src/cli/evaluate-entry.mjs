import { readFile } from "node:fs/promises";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { createEvoStoreAdapter } from "../adapters/evostore.ts";
import { createListingAdapter, LISTING_PROFILES } from "../adapters/listings.ts";
import { evaluateExtraction } from "../evaluate.ts";

const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw new Error("Invalid source registry");
const annotations = JSON.parse(
  await readFile(new URL("../../test/fixtures/annotations.json", import.meta.url), "utf8"),
);
const candidates = new Map();
const candidateCounts = {};
for (const profile of [{ sourceId: "evostore" }, ...LISTING_PROFILES]) {
  const source = registry.sources.find((entry) => entry.id === profile.sourceId);
  const html = await readFile(
    new URL(`../../test/fixtures/${profile.sourceId}.html`, import.meta.url),
    "utf8",
  );
  const fetchPage = async () => ({ status: 200, body: html });
  const adapter =
    profile.sourceId === "evostore"
      ? createEvoStoreAdapter(fetchPage)
      : createListingAdapter(profile, fetchPage);
  const result = await adapter.scan(source);
  if (!result.ok) throw new Error(`Recorded scan failed: ${profile.sourceId}`);
  candidates.set(profile.sourceId, result.offers);
  candidateCounts[profile.sourceId] = result.offers.length;
}
const report = evaluateExtraction(annotations.offers, candidates);
console.log(
  JSON.stringify(
    { recordedAt: annotations.recordedAt, scope: annotations.method, candidateCounts, ...report },
    null,
    2,
  ),
);
process.exitCode = report.mismatches.length ? 1 : 0;
