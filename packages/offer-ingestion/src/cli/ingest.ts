import { parseSourceRegistry, type SourceDefinition } from "@dashain-offer/source-registry";

import type { RunResult, ScanResult } from "../runner.ts";

export type IngestionCliDependencies = Readonly<{
  readRegistry(): Promise<string>;
  scan(source: SourceDefinition): Promise<ScanResult>;
  publish(sources: readonly SourceDefinition[]): Promise<readonly RunResult[] | null>;
  stdout(message: string): void;
  stderr(message: string): void;
}>;

function terminalText(value: string): string {
  return value.replace(/\p{Cc}/gu, "");
}

export async function runIngestionCli(
  args: readonly string[],
  dependencies: IngestionCliDependencies,
): Promise<number> {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
  const dryRun = commandArgs.length === 1 && commandArgs[0] === "--dry-run";
  if (commandArgs.length !== 0 && !dryRun) {
    dependencies.stderr("Usage: ingestion:once [--dry-run]\n");
    return 1;
  }

  let sources: readonly SourceDefinition[];
  try {
    const registry = parseSourceRegistry(JSON.parse(await dependencies.readRegistry()));
    if (!registry.ok) {
      dependencies.stderr("Source registry is invalid.\n");
      return 1;
    }
    sources = registry.sources;
  } catch {
    dependencies.stderr("Source registry could not be read.\n");
    return 1;
  }

  const source = sources.find((entry) => entry.id === "evostore" && entry.status === "ACTIVE");
  if (source === undefined) {
    dependencies.stderr("EvoStore is not active in the source registry.\n");
    return 1;
  }

  try {
    if (dryRun) {
      const result = await dependencies.scan(source);
      if (!result.ok) {
        dependencies.stderr(`EvoStore scan failed: ${result.reason}.\n`);
        return 1;
      }
      dependencies.stdout(`EvoStore: ${result.offers.length} candidates found.\n`);
      for (const offer of result.offers.slice(0, 20)) {
        dependencies.stdout(
          `${terminalText(offer.title)} | ${terminalText(offer.destinationUrl)}\n`,
        );
      }
      return 0;
    }

    const results = await dependencies.publish(sources);
    if (results === null) {
      dependencies.stdout("Another ingestion run is active.\n");
      return 0;
    }
    for (const result of results) {
      if (result.status === "FAILED") {
        dependencies.stderr(`${result.sourceId}: failed (${result.reason}).\n`);
      } else {
        dependencies.stdout(
          `${result.sourceId}: published ${result.published}, withdrawn ${result.withdrawn}, skipped ${result.skipped}.\n`,
        );
      }
    }
    return results.some((result) => result.status === "FAILED") ? 1 : 0;
  } catch {
    dependencies.stderr("Ingestion run failed.\n");
    return 1;
  }
}
