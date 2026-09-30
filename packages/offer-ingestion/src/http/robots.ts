import type { SourceDefinition } from "@dashain-offer/source-registry";
import type { PageFetcher } from "../adapters/evostore.ts";

type Rule = Readonly<{ allow: boolean; path: string }>;
type Group = { agents: string[]; rules: Rule[]; delayMs: number };
// Longest rule and most specific agent policy from RFC 9309:
// https://www.rfc-editor.org/rfc/rfc9309.html#section-2.2
function matchingGroups(contents: string): readonly Group[] {
  const groups: Group[] = [];
  let group: Group = { agents: [], rules: [], delayMs: 0 };
  let hasRules = false;
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(line.split("#")[0] ?? "");
    if (!match) continue;
    const field = match[1]?.toLowerCase();
    const value = match[2] ?? "";
    if (field === "user-agent") {
      if (hasRules) {
        groups.push(group);
        group = { agents: [], rules: [], delayMs: 0 };
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && group.agents.length) {
      hasRules = true;
      if (value) group.rules.push({ allow: field === "allow", path: value });
    } else if (field === "crawl-delay" && group.agents.length) {
      hasRules = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0)
        group.delayMs = Math.max(group.delayMs, seconds * 1000);
    }
  }
  groups.push(group);
  const agent = "dashainofferradar";
  const specificity = (entry: Group) =>
    Math.max(
      -1,
      ...entry.agents.map((a) => (a === "*" ? 0 : agent.includes(a) && a ? a.length : -1)),
    );
  const best = Math.max(-1, ...groups.map(specificity));
  return best < 0 ? [] : groups.filter((entry) => specificity(entry) === best);
}
export function robotsAllows(contents: string, rawUrl: string): boolean {
  const url = new URL(rawUrl);
  const target = url.pathname + url.search;
  const matching = matchingGroups(contents)
    .flatMap((entry) => entry.rules)
    .filter((rule) => {
      const anchored = rule.path.endsWith("$");
      const path = anchored ? rule.path.slice(0, -1) : rule.path;
      const pattern = path
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(target);
    })
    .sort(
      (a, b) =>
        b.path.replace(/[*$]/g, "").length - a.path.replace(/[*$]/g, "").length ||
        Number(b.allow) - Number(a.allow),
    );
  return matching[0]?.allow ?? true;
}

export function createRobotsAwareFetcher(
  fetchPage: PageFetcher,
  time: Readonly<{ now(): number; sleep(ms: number): Promise<void> }> = {
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
): PageFetcher {
  // Cache only within one runtime operation; the runtime recreates this for each run.
  const policies = new Map<string, Promise<string>>();
  const nextRequestAt = new Map<string, number>();
  return async (url: string, source: SourceDefinition) => {
    const origin = new URL(url).origin;
    let policy = policies.get(origin);
    if (policy === undefined) {
      policy = fetchPage(`${origin}/robots.txt`, source).then((response) => {
        if (response.status === 404 || response.status === 410) return "";
        if (response.status !== 200) throw new Error("Robots policy unavailable");
        if (/<html|<!doctype\s+html/i.test(response.body))
          throw new Error("Invalid robots response");
        return response.body;
      });
      policies.set(origin, policy);
    }
    const contents = await policy;
    if (!robotsAllows(contents, url)) throw new Error("Collection disallowed by robots policy");
    const delayMs = Math.max(1000, ...matchingGroups(contents).map((group) => group.delayMs));
    if (delayMs > 60000)
      throw new Error("Source crawl delay exceeds this worker's supported limit");
    const now = time.now();
    const start = Math.max(now, nextRequestAt.get(origin) ?? now);
    nextRequestAt.set(origin, start + delayMs);
    if (start > now) await time.sleep(start - now);
    return fetchPage(url, source);
  };
}
