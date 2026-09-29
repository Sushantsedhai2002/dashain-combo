import { describe, expect, it } from "vitest";

import { canonicalizeChannelUrl } from "../src/canonicalize-channel-url.js";

describe("canonicalizeChannelUrl", () => {
  it.each([
    ["https://EXAMPLE.com", "https://example.com/"],
    ["https://example.com:443/", "https://example.com/"],
    ["https://example.com/official/", "https://example.com/official"],
    ["https://example.com/official#offers", "https://example.com/official"],
    [
      "https://example.com/official/?campaign=dashain#offers",
      "https://example.com/official?campaign=dashain",
    ],
  ])("canonicalizes %s for comparison", (input, expected) => {
    expect(canonicalizeChannelUrl(input)).toBe(expected);
  });

  it.each([
    ["https://www.example.com/official", "https://example.com/official"],
    ["https://example.com/Official", "https://example.com/official"],
    ["https://example.com/official", "https://example.com/official-offers"],
    ["https://example.com/official?a=1", "https://example.com/official?a=2"],
    ["https://example.com/official?a=1&b=2", "https://example.com/official?b=2&a=1"],
  ])("keeps distinct resources %s and %s separate", (left, right) => {
    expect(canonicalizeChannelUrl(left)).not.toBe(canonicalizeChannelUrl(right));
  });
});
