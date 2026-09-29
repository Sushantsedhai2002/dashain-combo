import { describe, expect, it } from "vitest";

import { isPublicIpAddress } from "../src/cli/public-ip.mjs";

describe("isPublicIpAddress", () => {
  it.each([
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "fc00::1",
    "fe80::1",
  ])("blocks non-public address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it("rejects values that are not IP addresses", () => {
    expect(isPublicIpAddress("localhost")).toBe(false);
  });
});
