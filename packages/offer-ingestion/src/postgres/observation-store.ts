import type { Pool } from "pg";

import type { ObservationStore, ObservedOffer } from "../runner.ts";

type ObservationRow = Readonly<{
  source_offer_key: string;
  destination_url: string;
}>;

function generationFor(baseKey: string, sourceOfferKey: string): number {
  if (sourceOfferKey === baseKey) return 1;
  if (!sourceOfferKey.startsWith(`${baseKey}:g`)) throw new Error("Invalid observation key");
  const generation = Number(sourceOfferKey.slice(baseKey.length + 2));
  if (!Number.isSafeInteger(generation) || generation < 2)
    throw new Error("Invalid observation key");
  return generation;
}

export class PostgresObservationStore implements ObservationStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(sourceId: string): Promise<readonly ObservedOffer[]> {
    const result = await this.pool.query<ObservationRow>(
      `SELECT source_offer_key, destination_url
       FROM ingestion_observations
       WHERE source_id = $1 AND withdrawn_at IS NULL
       ORDER BY source_offer_key`,
      [sourceId],
    );
    return Object.freeze(
      result.rows.map((row) =>
        Object.freeze({
          sourceOfferKey: row.source_offer_key,
          destinationUrl: row.destination_url,
        }),
      ),
    );
  }

  async resolveKey(sourceId: string, baseKey: string): Promise<string> {
    const result = await this.pool.query<{
      generation: number;
      source_offer_key: string;
      withdrawn_at: Date | null;
    }>(
      `SELECT generation, source_offer_key, withdrawn_at
       FROM ingestion_observations
       WHERE source_id = $1 AND base_key = $2
       ORDER BY generation DESC LIMIT 1`,
      [sourceId, baseKey],
    );
    const latest = result.rows[0];
    if (latest === undefined) return baseKey;
    if (latest.withdrawn_at === null) return latest.source_offer_key;
    return `${baseKey}:g${latest.generation + 1}`;
  }

  async remember(sourceId: string, baseKey: string, offer: ObservedOffer): Promise<void> {
    await this.pool.query(
      `INSERT INTO ingestion_observations
         (source_id, base_key, generation, source_offer_key, destination_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_id, base_key, generation)
       DO UPDATE SET destination_url = EXCLUDED.destination_url,
                     last_seen_at = CURRENT_TIMESTAMP,
                     removal_confirmations = 0
       WHERE ingestion_observations.withdrawn_at IS NULL`,
      [
        sourceId,
        baseKey,
        generationFor(baseKey, offer.sourceOfferKey),
        offer.sourceOfferKey,
        offer.destinationUrl,
      ],
    );
  }

  async recordPresence(
    sourceId: string,
    sourceOfferKey: string,
    presence: "PRESENT" | "REMOVED" | "UNKNOWN",
  ): Promise<boolean> {
    const result = await this.pool.query<{ removal_confirmations: number }>(
      `UPDATE ingestion_observations
       SET removal_confirmations = CASE WHEN $3 = 'REMOVED' THEN removal_confirmations + 1 ELSE 0 END
       WHERE source_id = $1 AND source_offer_key = $2 AND withdrawn_at IS NULL
       RETURNING removal_confirmations`,
      [sourceId, sourceOfferKey, presence],
    );
    return (result.rows[0]?.removal_confirmations ?? 0) >= 2;
  }

  async markWithdrawn(sourceId: string, sourceOfferKey: string): Promise<void> {
    await this.pool.query(
      `UPDATE ingestion_observations
       SET withdrawn_at = COALESCE(withdrawn_at, CURRENT_TIMESTAMP)
       WHERE source_id = $1 AND source_offer_key = $2`,
      [sourceId, sourceOfferKey],
    );
  }
}
