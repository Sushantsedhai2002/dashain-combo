import { readFile } from "node:fs/promises";

import pg from "pg";

import { createOfferCatalog } from "@dashain-offer/offer-catalog";
import type { PageFetcher } from "../adapters/evostore.ts";
import { createWebsiteAdapters } from "../adapters/websites.ts";
import { createRobotsAwareFetcher } from "../http/robots.ts";
import { checkOfferPresence, createSafePageFetcher } from "../http/safe-fetch.ts";
import { PostgresObservationStore } from "../postgres/observation-store.ts";
import { runIngestionMigrations } from "../postgres/migrate.ts";
import { createIngestionRunner } from "../runner.ts";
import type { IngestionCliDependencies } from "./ingest.ts";

const RUN_LOCK_ID = 1_846_273_913;
const REGISTRY_URL = new URL("../../../../config/sources.json", import.meta.url);

type Io = Readonly<{ stdout(message: string): void; stderr(message: string): void }>;

export function createIngestionRuntime(
  databaseUrl: string | undefined,
  io: Io,
  options: Readonly<{ fetchPage?: PageFetcher; sourceIds?: readonly string[] }> = {},
): Readonly<{
  dependencies: IngestionCliDependencies;
  close(): Promise<void>;
}> {
  const fetchPage = options.fetchPage ?? createSafePageFetcher();
  const createAdapters = (guardedFetch: PageFetcher) =>
    createWebsiteAdapters(guardedFetch).filter(
      (adapter) => options.sourceIds === undefined || options.sourceIds.includes(adapter.sourceId),
    );
  const dryRunAdapters = createAdapters(createRobotsAwareFetcher(fetchPage));
  let pool: pg.Pool | null = null;
  let catalog: ReturnType<typeof createOfferCatalog> | null = null;

  const dependencies: IngestionCliDependencies = {
    supportedSourceIds: dryRunAdapters.map((adapter) => adapter.sourceId),
    readRegistry: () => readFile(REGISTRY_URL, "utf8"),
    scan: async (source) =>
      dryRunAdapters.find((adapter) => adapter.sourceId === source.id)?.scan(source) ?? {
        ok: false,
        reason: "UNSUPPORTED_SOURCE",
      },
    async publish(sources) {
      if (databaseUrl === undefined || databaseUrl.trim() === "")
        throw new Error("DATABASE_URL missing");
      pool ??= new pg.Pool({ connectionString: databaseUrl, max: 3, allowExitOnIdle: true });
      catalog ??= createOfferCatalog({ databaseUrl });
      await runIngestionMigrations(pool);
      const client = await pool.connect();
      let locked = false;
      try {
        const result = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_lock($1) AS acquired",
          [RUN_LOCK_ID],
        );
        locked = result.rows[0]?.acquired === true;
        if (!locked) return null;
        const guardedFetch = createRobotsAwareFetcher(fetchPage);
        const runner = createIngestionRunner({
          sources,
          adapters: createAdapters(guardedFetch),
          catalog,
          observations: new PostgresObservationStore(pool),
          checkPresence: (url, source) => checkOfferPresence(url, source, guardedFetch),
        });
        return await runner.runOnce();
      } finally {
        if (locked) {
          await client.query("SELECT pg_advisory_unlock($1)", [RUN_LOCK_ID]).catch(() => undefined);
        }
        client.release();
      }
    },
    stdout: io.stdout,
    stderr: io.stderr,
  };

  return Object.freeze({
    dependencies,
    async close() {
      if (pool !== null) await pool.end();
    },
  });
}
