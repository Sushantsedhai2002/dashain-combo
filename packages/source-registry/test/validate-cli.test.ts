import { describe, expect, it, vi } from "vitest";

import { runValidateCli } from "../src/cli/validate.ts";

const validRegistry = JSON.stringify([
  {
    id: "daraz-nepal",
    displayName: "Daraz Nepal",
    status: "ACTIVE",
    supportedMarkets: ["NP"],
    marketSegments: ["general-retail"],
    channels: [
      {
        kind: "WEBSITE",
        url: "https://www.daraz.com.np/",
        isEnabled: true,
      },
    ],
    verification: {
      verifiedAt: "2026-09-29T12:00:00.000Z",
      evidenceUrl: "https://www.daraz.com.np/about-us/",
    },
  },
]);

function createIo(fileContents: string) {
  return {
    readTextFile: vi.fn(async () => fileContents),
    stdout: vi.fn(),
    stderr: vi.fn(),
  };
}

describe("runValidateCli", () => {
  it("validates the requested file and reports success", async () => {
    const io = createIo(validRegistry);

    const exitCode = await runValidateCli(["--file", "registry.json"], io);

    expect(exitCode).toBe(0);
    expect(io.readTextFile).toHaveBeenCalledWith("registry.json");
    expect(io.stdout).toHaveBeenCalledWith("Valid registry: 1 source.\n");
    expect(io.stderr).not.toHaveBeenCalled();
  });

  it("uses config/sources.json by default", async () => {
    const io = createIo("[]");

    const exitCode = await runValidateCli([], io);

    expect(exitCode).toBe(0);
    expect(io.readTextFile).toHaveBeenCalledWith("config/sources.json");
  });

  it("accepts the pnpm argument separator", async () => {
    const io = createIo(validRegistry);

    const exitCode = await runValidateCli(["--", "--file", "registry.json"], io);

    expect(exitCode).toBe(0);
    expect(io.readTextFile).toHaveBeenCalledWith("registry.json");
  });

  it("prints invalid registry issues in parser order without library details", async () => {
    const io = createIo(
      JSON.stringify([
        {
          id: "Invalid ID",
          displayName: "Invalid Source",
          status: "UNKNOWN",
          supportedMarkets: ["NP"],
          marketSegments: ["general-retail"],
          channels: [],
          verification: null,
        },
      ]),
    );

    const exitCode = await runValidateCli(["--file", "invalid.json"], io);

    expect(exitCode).toBe(1);
    expect(io.stdout).not.toHaveBeenCalled();
    expect(io.stderr.mock.calls.map(([message]) => message)).toEqual([
      "Invalid registry: 2 issues.\n",
      'INVALID_SCHEMA $[0].id [Invalid ID]: Registry value at "$[0].id" does not match the source schema.\n',
      'INVALID_SCHEMA $[0].status [Invalid ID]: Registry value at "$[0].status" does not match the source schema.\n',
    ]);
  });

  it.each([
    ["malformed JSON", "{", 'Could not parse registry JSON from "broken.json".\n'],
    ["an unreadable file", null, 'Could not read registry file "broken.json".\n'],
  ])("returns a clean expected error for %s", async (_description, contents, expectedMessage) => {
    const io = createIo(contents ?? "");
    if (contents === null) {
      io.readTextFile.mockRejectedValue(new Error("sensitive filesystem detail"));
    }

    const exitCode = await runValidateCli(["--file", "broken.json"], io);

    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expectedMessage);
    expect(io.stderr).not.toHaveBeenCalledWith(
      expect.stringContaining("sensitive filesystem detail"),
    );
  });

  it.each([["--file"], ["--unknown"], ["one.json", "two.json"]])(
    "rejects invalid arguments with a usage error",
    async (...args) => {
      const io = createIo(validRegistry);

      const exitCode = await runValidateCli(args, io);

      expect(exitCode).toBe(2);
      expect(io.readTextFile).not.toHaveBeenCalled();
      expect(io.stderr).toHaveBeenCalledWith("Usage: sources:validate [--file <registry.json>]\n");
    },
  );

  it("never makes a network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const io = createIo(validRegistry);

    await runValidateCli(["--file", "registry.json"], io);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
