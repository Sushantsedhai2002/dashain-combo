import { canonicalizeChannelUrl } from "./canonicalize-channel-url.ts";
import type { RegistryIssue, RegistryResult, SourceDefinition } from "./index.ts";
import { SourceRegistrySchema } from "./schema.ts";

function formatPath(path: readonly PropertyKey[]): string {
  let formatted = "$";

  for (const segment of path) {
    if (typeof segment === "number") {
      formatted += `[${segment}]`;
    } else if (typeof segment === "string" && /^[A-Za-z_$][\w$]*$/.test(segment)) {
      formatted += `.${segment}`;
    } else if (typeof segment === "string") {
      formatted += `[${JSON.stringify(segment)}]`;
    } else {
      formatted += `[${String(segment)}]`;
    }
  }

  return formatted;
}

function sourceIdAtPath(input: unknown, path: readonly PropertyKey[]): string | undefined {
  const sourceIndex = path[0];
  if (typeof sourceIndex !== "number" || !Array.isArray(input)) {
    return undefined;
  }

  const source = input[sourceIndex];
  if (typeof source !== "object" || source === null || !("id" in source)) {
    return undefined;
  }

  return typeof source.id === "string" ? source.id : undefined;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePaths(left: string, right: string): number {
  const leftParts = left.match(/\d+|\D+/g) ?? [];
  const rightParts = right.match(/\d+|\D+/g) ?? [];
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    if (/^\d+$/.test(leftPart) && /^\d+$/.test(rightPart)) {
      return Number(leftPart) - Number(rightPart);
    }

    return compareText(leftPart, rightPart);
  }

  return 0;
}

function compareIssues(left: RegistryIssue, right: RegistryIssue): number {
  return (
    comparePaths(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function invalidSchemaIssue(input: unknown, pathParts: readonly PropertyKey[]): RegistryIssue {
  const path = formatPath(pathParts);
  const sourceId = sourceIdAtPath(input, pathParts);
  const issue = {
    code: "INVALID_SCHEMA" as const,
    path,
    message: `Registry value at "${path}" does not match the source schema.`,
  };

  return Object.freeze(sourceId === undefined ? issue : { ...issue, sourceId });
}

function activeSourceIssues(sources: readonly SourceDefinition[]): readonly RegistryIssue[] {
  const issues: RegistryIssue[] = [];

  for (const [index, source] of sources.entries()) {
    if (source.status !== "ACTIVE") continue;

    if (!source.channels.some((channel) => channel.isEnabled)) {
      issues.push(
        Object.freeze({
          code: "ACTIVE_SOURCE_WITHOUT_CHANNEL",
          path: `$[${index}].channels`,
          message: "Active source must have at least one enabled channel.",
          sourceId: source.id,
        }),
      );
    }

    if (source.verification === null) {
      issues.push(
        Object.freeze({
          code: "ACTIVE_SOURCE_NOT_VERIFIED",
          path: `$[${index}].verification`,
          message: "Active source must include verification evidence.",
          sourceId: source.id,
        }),
      );
    }
  }

  return issues;
}

function duplicateIssues(sources: readonly SourceDefinition[]): readonly RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  const firstIdPaths = new Map<string, string>();
  const firstChannelPaths = new Map<string, string>();

  for (const [sourceIndex, source] of sources.entries()) {
    const idPath = `$[${sourceIndex}].id`;
    const firstIdPath = firstIdPaths.get(source.id);

    if (firstIdPath === undefined) {
      firstIdPaths.set(source.id, idPath);
    } else {
      issues.push(
        Object.freeze({
          code: "DUPLICATE_SOURCE_ID",
          path: idPath,
          message: `Source ID duplicates the value first declared at "${firstIdPath}".`,
          sourceId: source.id,
        }),
      );
    }

    for (const [channelIndex, channel] of source.channels.entries()) {
      const channelPath = `$[${sourceIndex}].channels[${channelIndex}].url`;
      const canonicalUrl = canonicalizeChannelUrl(channel.url);
      const firstChannelPath = firstChannelPaths.get(canonicalUrl);

      if (firstChannelPath === undefined) {
        firstChannelPaths.set(canonicalUrl, channelPath);
      } else {
        issues.push(
          Object.freeze({
            code: "DUPLICATE_CHANNEL_URL",
            path: channelPath,
            message: `Channel URL duplicates the value first declared at "${firstChannelPath}".`,
            sourceId: source.id,
          }),
        );
      }
    }
  }

  return issues;
}

function failure(issues: readonly RegistryIssue[]): RegistryResult {
  return Object.freeze({
    ok: false,
    issues: Object.freeze([...issues].sort(compareIssues)),
  });
}

export function parseSourceRegistry(input: unknown): RegistryResult {
  const parsed = SourceRegistrySchema.safeParse(input);

  if (!parsed.success) {
    const issues: RegistryIssue[] = [];

    for (const issue of parsed.error.issues) {
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) {
          issues.push(invalidSchemaIssue(input, [...issue.path, key]));
        }
      } else {
        issues.push(invalidSchemaIssue(input, issue.path));
      }
    }

    return failure(issues);
  }

  const registryIssues = [...activeSourceIssues(parsed.data), ...duplicateIssues(parsed.data)];
  if (registryIssues.length > 0) {
    return failure(registryIssues);
  }

  return Object.freeze({ ok: true, sources: parsed.data });
}
