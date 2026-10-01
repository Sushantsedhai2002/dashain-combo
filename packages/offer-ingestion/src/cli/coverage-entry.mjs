import { readFile } from "node:fs/promises";
import { createOfferCatalog, readCoverage } from "@dashain-offer/offer-catalog";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for published coverage checks");
const config = JSON.parse(
  await readFile(new URL("../../../../config/coverage.json", import.meta.url), "utf8"),
);
const catalog = createOfferCatalog({ databaseUrl });
const report = await readCoverage(catalog, config.sellerIdentities);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.achieved ? 0 : 1;
