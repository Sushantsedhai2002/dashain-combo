import { describe, expect, it } from "vitest";
import { calendarDate } from "../src/adapters/campaign-date.ts";
describe("campaign calendar dates", () => {
  it.each([
    ["Sep 28, 2026", "2026-09-28"],
    ["31 August 2026", "2026-08-31"],
    ["February 29, 2024", "2024-02-29"],
    ["Feb 29, 2026", null],
    ["Feb 30, 2026", null],
    ["SeptemberOops 1, 2026", null],
    ["Invalid 1, 2026", null],
    ["September 31, 2026", null],
    ["", null],
  ])("parses %s without calendar rollover", (value, expected) =>
    expect(calendarDate(value ?? "")).toBe(expected),
  );
});
