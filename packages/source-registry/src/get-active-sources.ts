import type { SourceDefinition } from "./index.ts";

export function getActiveSources(
  sources: readonly SourceDefinition[],
): readonly SourceDefinition[] {
  return Object.freeze(sources.filter((source) => source.status === "ACTIVE"));
}
