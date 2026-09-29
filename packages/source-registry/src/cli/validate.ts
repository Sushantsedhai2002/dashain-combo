import { parseSourceRegistry, type RegistryIssue } from "../index.ts";

const DEFAULT_REGISTRY_FILE = "config/sources.json";
const USAGE = "Usage: sources:validate [--file <registry.json>]\n";

type ValidateCliIo = Readonly<{
  readTextFile(path: string): Promise<string>;
  stdout(message: string): void;
  stderr(message: string): void;
}>;

function registryFileFromArgs(args: readonly string[]): string | undefined {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
  if (commandArgs.length === 0) return DEFAULT_REGISTRY_FILE;
  if (commandArgs.length === 2 && commandArgs[0] === "--file" && commandArgs[1] !== "") {
    return commandArgs[1];
  }
  return undefined;
}

function formatIssue(issue: RegistryIssue): string {
  const source = issue.sourceId === undefined ? "" : ` [${issue.sourceId}]`;
  return `${issue.code} ${issue.path}${source}: ${issue.message}\n`;
}

export async function runValidateCli(args: readonly string[], io: ValidateCliIo): Promise<number> {
  const registryFile = registryFileFromArgs(args);
  if (registryFile === undefined) {
    io.stderr(USAGE);
    return 2;
  }

  let contents: string;
  try {
    contents = await io.readTextFile(registryFile);
  } catch {
    io.stderr(`Could not read registry file ${JSON.stringify(registryFile)}.\n`);
    return 1;
  }

  let input: unknown;
  try {
    input = JSON.parse(contents);
  } catch {
    io.stderr(`Could not parse registry JSON from ${JSON.stringify(registryFile)}.\n`);
    return 1;
  }

  const result = parseSourceRegistry(input);
  if (!result.ok) {
    const noun = result.issues.length === 1 ? "issue" : "issues";
    io.stderr(`Invalid registry: ${result.issues.length} ${noun}.\n`);
    for (const issue of result.issues) io.stderr(formatIssue(issue));
    return 1;
  }

  const noun = result.sources.length === 1 ? "source" : "sources";
  io.stdout(`Valid registry: ${result.sources.length} ${noun}.\n`);
  return 0;
}
