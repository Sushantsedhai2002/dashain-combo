import { parseSourceRegistry, type ChannelKind, type SourceDefinition } from "../index.ts";

const DEFAULT_REGISTRY_FILE = "config/sources.json";
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const USAGE = "Usage: sources:check --live [--file <registry.json>]\n";

type AbortControllerLike = Readonly<{
  signal: unknown;
  abort(): void;
}>;

type RequestOptions = Readonly<{
  method: "HEAD";
  redirect: "manual";
  signal: unknown;
  addresses: readonly string[];
}>;

export type LiveCheckDependencies = Readonly<{
  request(url: string, options: RequestOptions): Promise<Readonly<{ status: number }>>;
  resolveHostname(hostname: string): Promise<readonly string[]>;
  isPublicIpAddress(address: string): boolean;
  createAbortController(): AbortControllerLike;
  setTimer(callback: () => void, milliseconds: number): number;
  clearTimer(timer: number): void;
}>;

type LiveCheckTarget = Readonly<{
  sourceId: string;
  kind: ChannelKind;
  url: string;
}>;

export type LiveCheckResult =
  | Readonly<LiveCheckTarget & { category: "REACHABLE"; status: number }>
  | Readonly<LiveCheckTarget & { category: "NETWORK_ERROR" | "TIMEOUT" | "BLOCKED" }>;

type LiveCheckOptions = Readonly<{
  concurrency: number;
  timeoutMs: number;
}>;

type LiveCheckIo = Readonly<{
  readTextFile(path: string): Promise<string>;
  stdout(message: string): void;
  stderr(message: string): void;
}>;

function parseArguments(args: readonly string[]): string | undefined {
  const commandArgs = args[0] === "--" ? args.slice(1) : args;
  let registryFile = DEFAULT_REGISTRY_FILE;
  let hasLiveFlag = false;

  for (let index = 0; index < commandArgs.length; index += 1) {
    const argument = commandArgs[index];
    if (argument === "--live" && !hasLiveFlag) {
      hasLiveFlag = true;
      continue;
    }

    const value = commandArgs[index + 1];
    if (argument === "--file" && value !== undefined && !value.startsWith("--")) {
      registryFile = value;
      index += 1;
      continue;
    }

    return undefined;
  }

  return hasLiveFlag ? registryFile : undefined;
}

function enabledTargets(sources: readonly SourceDefinition[]): readonly LiveCheckTarget[] {
  return sources.flatMap((source) =>
    source.channels.flatMap((channel) =>
      channel.isEnabled ? [{ sourceId: source.id, kind: channel.kind, url: channel.url }] : [],
    ),
  );
}

function hostnameFromHttpsUrl(url: string): string | undefined {
  const match = /^https:\/\/(\[[^\]]+\]|[^:/?#]+)(?::\d+)?(?:[/?#]|$)/i.exec(url);
  const hostname = match?.[1];
  if (hostname?.startsWith("[") && hostname.endsWith("]")) return hostname.slice(1, -1);
  return hostname;
}

async function performTargetCheck(
  target: LiveCheckTarget,
  dependencies: LiveCheckDependencies,
  signal: unknown,
): Promise<LiveCheckResult> {
  const hostname = hostnameFromHttpsUrl(target.url);
  if (hostname === undefined) return { ...target, category: "BLOCKED" };

  let addresses: readonly string[];
  try {
    addresses = await dependencies.resolveHostname(hostname);
  } catch {
    return { ...target, category: "NETWORK_ERROR" };
  }

  if (
    addresses.length === 0 ||
    addresses.some((address) => !dependencies.isPublicIpAddress(address))
  ) {
    return { ...target, category: "BLOCKED" };
  }

  try {
    const response = await dependencies.request(target.url, {
      method: "HEAD",
      redirect: "manual",
      signal,
      addresses,
    });
    return { ...target, category: "REACHABLE", status: response.status };
  } catch {
    return { ...target, category: "NETWORK_ERROR" };
  }
}

async function checkTarget(
  target: LiveCheckTarget,
  dependencies: LiveCheckDependencies,
  timeoutMs: number,
): Promise<LiveCheckResult> {
  const controller = dependencies.createAbortController();
  return new Promise((resolve) => {
    let settled = false;
    const timer = dependencies.setTimer(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve({ ...target, category: "TIMEOUT" });
    }, timeoutMs);

    void performTargetCheck(target, dependencies, controller.signal).then((result) => {
      if (settled) return;
      settled = true;
      dependencies.clearTimer(timer);
      resolve(result);
    });
  });
}

export async function checkLiveChannels(
  sources: readonly SourceDefinition[],
  dependencies: LiveCheckDependencies,
  options: LiveCheckOptions,
): Promise<readonly LiveCheckResult[]> {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new RangeError("Live-check concurrency must be a positive integer.");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new RangeError("Live-check timeout must be positive.");
  }

  const targets = enabledTargets(sources);
  let nextIndex = 0;

  async function worker(): Promise<
    readonly Readonly<{ index: number; result: LiveCheckResult }>[]
  > {
    const completed: Readonly<{ index: number; result: LiveCheckResult }>[] = [];
    while (nextIndex < targets.length) {
      const index = nextIndex;
      nextIndex += 1;
      const target = targets[index];
      if (target !== undefined) {
        completed.push({
          index,
          result: await checkTarget(target, dependencies, options.timeoutMs),
        });
      }
    }
    return completed;
  }

  const workerCount = Math.min(options.concurrency, targets.length);
  const completed = (await Promise.all(Array.from({ length: workerCount }, worker))).flat();
  return completed.sort((left, right) => left.index - right.index).map(({ result }) => result);
}

function formatResult(result: LiveCheckResult): string {
  const status = result.category === "REACHABLE" ? ` HTTP ${result.status}` : "";
  return `${result.category} ${result.sourceId} ${result.kind} ${result.url}${status}\n`;
}

export async function runCheckLiveCli(
  args: readonly string[],
  io: LiveCheckIo,
  dependencies: LiveCheckDependencies,
): Promise<number> {
  const registryFile = parseArguments(args);
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

  const registry = parseSourceRegistry(input);
  if (!registry.ok) {
    io.stderr(`Registry is invalid (${registry.issues.length} issues); run sources:validate.\n`);
    return 1;
  }

  const results = await checkLiveChannels(registry.sources, dependencies, {
    concurrency: DEFAULT_CONCURRENCY,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  for (const result of results) io.stdout(formatResult(result));

  const reachable = results.filter((result) => result.category === "REACHABLE").length;
  io.stdout(
    `Live check complete: ${results.length} enabled channels checked; ${reachable} reachable. ` +
      "Reachability does not verify official identity.\n",
  );
  return 0;
}
