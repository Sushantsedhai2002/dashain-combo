import { load } from "cheerio";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Decode the observed Next Flight JSON transport, including length-prefixed text.
 * Source scripts are data; they are never evaluated. Text records cannot inject JSON records.
 */
export function readFlightRecords(html: string): readonly unknown[] | null {
  const $ = load(html);
  let flight = "";
  for (const element of $("script").toArray()) {
    const match = /^self\.__next_f\.push\((\[.*\])\);?$/s.exec($(element).text().trim());
    if (!match?.[1]) continue;
    try {
      const chunk: unknown = JSON.parse(match[1]);
      if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === "string")
        flight += chunk[1];
    } catch {
      return null;
    }
  }
  const buffer = Buffer.from(flight);
  if (!buffer.length || buffer.length > 2_000_000) return null;
  const records: unknown[] = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    if (buffer[cursor] === 10) {
      cursor++;
      continue;
    }
    const colon = buffer.indexOf(58, cursor);
    if (colon < 0 || !/^[a-f0-9]*$/i.test(buffer.subarray(cursor, colon).toString())) return null;
    cursor = colon + 1;
    if (buffer[cursor] === 84) {
      const comma = buffer.indexOf(44, cursor);
      if (comma < 0) return null;
      const lengthText = buffer.subarray(cursor + 1, comma).toString();
      if (!/^[a-f0-9]+$/i.test(lengthText)) return null;
      cursor = comma + 1 + Number.parseInt(lengthText, 16);
      if (cursor > buffer.length) return null;
      continue;
    }
    const newline = buffer.indexOf(10, cursor);
    const end = newline < 0 ? buffer.length : newline;
    const line = buffer.subarray(cursor, end).toString();
    if (line.startsWith("[") || line.startsWith("{")) {
      try {
        records.push(JSON.parse(line));
      } catch {
        return null;
      }
    }
    cursor = end + 1;
  }
  return records;
}

export function flightObjects(records: readonly unknown[]): readonly Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const pending = records.map((value) => ({ value, depth: 0 }));
  let visited = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++visited > 100_000 || entry.depth > 100) return [];
    if (isRecord(entry.value)) found.push(entry.value);
    if (typeof entry.value !== "object" || entry.value === null) continue;
    for (const value of Object.values(entry.value)) pending.push({ value, depth: entry.depth + 1 });
  }
  return found;
}
