import { parseSourceRegistry, type SourceDefinition } from "@dashain-offer/source-registry";

import type { RunResult, ScanResult } from "../runner.ts";

export type IngestionCliDependencies = Readonly<{
  supportedSourceIds?: readonly string[];
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
  let dryRun = false;
  let selectedSource: string | null = null;
  for (let index = 0; index < commandArgs.length; index += 1) {
    const argument = commandArgs[index];
    if (argument === "--dry-run" && !dryRun) {
      dryRun = true;
      continue;
    }
    const next = commandArgs[index + 1];
    if (
      argument === "--source" &&
      selectedSource === null &&
      next !== undefined &&
      /^[a-z0-9-]+$/.test(next)
    ) {
      selectedSource = next;
      index += 1;
      continue;
    }
    dependencies.stderr("Usage: ingestion:once [--dry-run] [--source <source-id>]\n");
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

  const supported = dependencies.supportedSourceIds ?? ["evostore"];
  const enabled = sources.filter(
    (entry) =>
      entry.status === "ACTIVE" &&
      supported.includes(entry.id) &&
      (selectedSource === null || entry.id === selectedSource),
  );
  if (enabled.length === 0) {
    dependencies.stderr(
      "Requested adapter source is unsupported or not active in the source registry.\n",
    );
    return 1;
  }

  try {
    if (dryRun) {
      let failed = false;
      for (const source of enabled) {
        const result = await dependencies.scan(source);
        if (!result.ok) {
          dependencies.stderr(
            `${terminalText(source.displayName)} scan failed: ${result.reason}.\n`,
          );
          failed = true;
          continue;
        }
        dependencies.stdout(
          `${terminalText(source.displayName)}: ${result.offers.length} candidates found.\n`,
        );
        for (const offer of result.offers.slice(0, 20)) {
          dependencies.stdout(
            `${terminalText(offer.title)} | ${terminalText(offer.destinationUrl)}\n`,
          );
        }
      }
      return failed ? 1 : 0;
    }

    const results = await dependencies.publish(enabled);
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
