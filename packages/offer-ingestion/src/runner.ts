import type { OfferCatalog, PublishOfferInput } from "@dashain-offer/offer-catalog";
import type { SourceDefinition } from "@dashain-offer/source-registry";

export type CandidateOffer = Omit<PublishOfferInput, "source">;

export type ScanFailure = "NETWORK_ERROR" | "STRUCTURE_CHANGED" | "UNSUPPORTED_SOURCE";

export type ScanResult =
  | Readonly<{
      ok: true;
      offers: readonly CandidateOffer[];
      authoritative?: boolean;
      partial?: boolean;
    }>
  | Readonly<{ ok: false; reason: ScanFailure }>;

export type SourceAdapter = Readonly<{
  sourceId: string;
  scan(source: SourceDefinition): Promise<ScanResult>;
}>;

export type ObservedOffer = Readonly<{
  sourceOfferKey: string;
  destinationUrl: string;
}>;

export interface ObservationStore {
  quarantine?(sourceId: string, offer: CandidateOffer, reasons: readonly unknown[]): Promise<void>;
  clearQuarantine?(sourceId: string, key: string): Promise<void>;
  list(sourceId: string): Promise<readonly ObservedOffer[]>;
  resolveKey(sourceId: string, baseKey: string): Promise<string>;
  remember(sourceId: string, baseKey: string, offer: ObservedOffer): Promise<void>;
  recordPresence(sourceId: string, sourceOfferKey: string, presence: Presence): Promise<boolean>;
  markWithdrawn(sourceId: string, sourceOfferKey: string): Promise<void>;
}

export type Presence = "PRESENT" | "REMOVED" | "UNKNOWN";

export type RunResult =
  | Readonly<{
      sourceId: string;
      status: "COMPLETE" | "PARTIAL";
      published: number;
      withdrawn: number;
      skipped: number;
    }>
  | Readonly<{ sourceId: string; status: "FAILED"; reason: ScanFailure | "PUBLISH_REJECTED" }>;

export type IngestionDependencies = Readonly<{
  sources: readonly SourceDefinition[];
  adapters: readonly SourceAdapter[];
  catalog: Pick<OfferCatalog, "publishOffer" | "withdrawOffer">;
  observations: ObservationStore;
  checkPresence(url: string, source: SourceDefinition): Promise<Presence>;
}>;

function isOnEnabledWebsite(url: string, source: SourceDefinition): boolean {
  try {
    const destination = new URL(url);
    if (
      destination.protocol !== "https:" ||
      destination.username !== "" ||
      destination.password !== ""
    ) {
      return false;
    }
    return source.channels.some(
      (channel) =>
        channel.kind === "WEBSITE" &&
        channel.isEnabled &&
        new URL(channel.url).origin === destination.origin,
    );
  } catch {
    return false;
  }
}

export function createIngestionRunner(dependencies: IngestionDependencies): Readonly<{
  runOnce(): Promise<readonly RunResult[]>;
}> {
  return Object.freeze({
    async runOnce(): Promise<readonly RunResult[]> {
      const results: RunResult[] = [];
      for (const adapter of dependencies.adapters) {
        const source = dependencies.sources.find(
          (entry) => entry.id === adapter.sourceId && entry.status === "ACTIVE",
        );
        if (
          source === undefined ||
          !source.channels.some((channel) => channel.kind === "WEBSITE" && channel.isEnabled)
        ) {
          continue;
        }

        let scan: ScanResult;
        try {
          scan = await adapter.scan(source);
        } catch {
          scan = { ok: false, reason: "NETWORK_ERROR" };
        }
        if (!scan.ok) {
          results.push({ sourceId: source.id, status: "FAILED", reason: scan.reason });
          continue;
        }

        const existing = await dependencies.observations.list(source.id);
        const current = new Set<string>();
        const candidateKeys = new Set<string>();
        let published = 0;
        let skipped = 0;
        let rejected = false;

        for (const offer of scan.offers) {
          if (
            candidateKeys.has(offer.sourceOfferKey) ||
            !isOnEnabledWebsite(offer.destinationUrl, source)
          ) {
            skipped += 1;
            continue;
          }
          candidateKeys.add(offer.sourceOfferKey);
          const sourceOfferKey = offer.discovery?.campaign
            ? offer.sourceOfferKey
            : await dependencies.observations.resolveKey(source.id, offer.sourceOfferKey);
          current.add(sourceOfferKey);
          const result = await dependencies.catalog.publishOffer({
            ...offer,
            sourceOfferKey,
            source,
          });
          if (!result.ok) {
            await dependencies.observations.quarantine?.(source.id, offer, result.issues);
            rejected = true;
            continue;
          }
          if (result.value.lifecycleStatus === "WITHDRAWN") {
            await dependencies.observations.remember(source.id, offer.sourceOfferKey, {
              sourceOfferKey,
              destinationUrl: offer.destinationUrl,
            });
            await dependencies.observations.markWithdrawn(source.id, sourceOfferKey);
            skipped += 1;
            continue;
          }
          await dependencies.observations.remember(source.id, offer.sourceOfferKey, {
            sourceOfferKey,
            destinationUrl: offer.destinationUrl,
          });
          await dependencies.observations.clearQuarantine?.(source.id, offer.sourceOfferKey);
          published += 1;
        }
        if (rejected) {
          results.push({ sourceId: source.id, status: "FAILED", reason: "PUBLISH_REJECTED" });
          continue;
        }

        let withdrawn = 0;
        for (const offer of existing) {
          if (current.has(offer.sourceOfferKey)) continue;
          if (scan.partial) continue;
          let presence: Presence;
          try {
            presence = scan.authoritative
              ? "REMOVED"
              : await dependencies.checkPresence(offer.destinationUrl, source);
          } catch {
            presence = "UNKNOWN";
          }
          const confirmedRemoved = await dependencies.observations.recordPresence(
            source.id,
            offer.sourceOfferKey,
            presence,
          );
          if (!confirmedRemoved) continue;
          const result = await dependencies.catalog.withdrawOffer({
            sourceId: source.id,
            sourceOfferKey: offer.sourceOfferKey,
          });
          if (!result.ok) continue;
          await dependencies.observations.markWithdrawn(source.id, offer.sourceOfferKey);
          withdrawn += 1;
        }
        results.push({
          sourceId: source.id,
          status: scan.partial ? "PARTIAL" : "COMPLETE",
          published,
          withdrawn,
          skipped,
        });
      }
      return Object.freeze(results);
    },
  });
}
