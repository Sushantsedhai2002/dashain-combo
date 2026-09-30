import { describe, expect, it, vi } from "vitest";

import { runIngestionCli } from "../src/cli/ingest.ts";

const source = {
  id: "evostore",
  displayName: "EvoStore",
  status: "ACTIVE",
  supportedMarkets: ["NP"],
  marketSegments: ["electronics-retail"],
  channels: [{ kind: "WEBSITE", url: "https://evostore.com.np/", isEnabled: true }],
  verification: {
    verifiedAt: "2026-09-30T00:00:00+05:45",
    evidenceUrl: "https://evostore.com.np/",
  },
};

function io(registry: string) {
  const output: string[] = [];
  const errors: string[] = [];
  const publish = vi.fn(async () => [
    { sourceId: "evostore", status: "COMPLETE" as const, published: 1, withdrawn: 0, skipped: 0 },
  ]);
  return {
    output,
    errors,
    publish,
    dependencies: {
      readRegistry: async () => registry,
      scan: async () => ({
        ok: true as const,
        offers: [
          {
            title: "Speaker sale",
            sourceOfferKey: "evostore:abc",
            destinationUrl: "https://evostore.com.np/item",
            category: "OTHER" as const,
          },
        ],
      }),
      publish,
      stdout: (message: string) => output.push(message),
      stderr: (message: string) => errors.push(message),
    },
  };
}

describe("ingestion CLI", () => {
  it("dry-runs every supported active source, continues after failure, and can select one source", async () => {
    const other = {
      ...source,
      id: "online-saathi",
      displayName: "Online Saathi",
      channels: [{ kind: "WEBSITE", isEnabled: true, url: "https://onlinesaathi.com/" }],
    };
    const result = io(JSON.stringify([source, other]));
    const scan = vi.fn<typeof result.dependencies.scan>(result.dependencies.scan);
    const dependencies = {
      ...result.dependencies,
      supportedSourceIds: ["evostore", "online-saathi"],
      scan,
    };
    expect(await runIngestionCli(["--dry-run"], dependencies)).toBe(0);
    expect(scan).toHaveBeenCalledTimes(2);
    scan.mockClear();
    expect(await runIngestionCli(["--dry-run", "--source", "online-saathi"], dependencies)).toBe(0);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(await runIngestionCli(["--source", "unknown"], dependencies)).toBe(1);
    const failed = await runIngestionCli(["--dry-run"], {
      ...dependencies,
      scan: async (s) =>
        s.id === "evostore" ? { ok: false, reason: "NETWORK_ERROR" } : result.dependencies.scan(),
    });
    expect(failed).toBe(1);
    expect(result.output.join(" ")).toContain("Online Saathi");
    expect(result.publish).not.toHaveBeenCalled();
  });
  it("validates registry before network or publication", async () => {
    const result = io("{}");
    const scan = vi.fn(result.dependencies.scan);
    await expect(runIngestionCli([], { ...result.dependencies, scan })).resolves.toBe(1);
    expect(scan).not.toHaveBeenCalled();
    expect(result.publish).not.toHaveBeenCalled();
    expect(result.errors.join(" ")).toMatch(/registry/i);
  });

  it("dry-runs without publishing", async () => {
    const result = io(JSON.stringify([source]));
    await expect(runIngestionCli(["--dry-run"], result.dependencies)).resolves.toBe(0);
    expect(result.publish).not.toHaveBeenCalled();
    expect(result.output.join(" ")).toMatch(/1 candidate/i);
  });

  it("strips terminal control characters from source text in dry-run output", async () => {
    const result = io(JSON.stringify([source]));
    await expect(
      runIngestionCli(["--dry-run"], {
        ...result.dependencies,
        scan: async () => ({
          ok: true,
          offers: [
            {
              title: "Speaker\u001b[31m sale",
              sourceOfferKey: "evostore:abc",
              destinationUrl: "https://evostore.com.np/item",
              category: "OTHER",
            },
          ],
        }),
      }),
    ).resolves.toBe(0);
    expect(result.output.join(" ")).not.toContain("\u001b");
  });

  it("reports a completed publishing run", async () => {
    const result = io(JSON.stringify([source]));
    await expect(runIngestionCli([], result.dependencies)).resolves.toBe(0);
    expect(result.publish).toHaveBeenCalledOnce();
    expect(result.output.join(" ")).toMatch(/published 1/i);
  });

  it("rejects unknown flags without touching dependencies", async () => {
    const result = io(JSON.stringify([source]));
    await expect(runIngestionCli(["--wrong"], result.dependencies)).resolves.toBe(1);
    expect(result.publish).not.toHaveBeenCalled();
  });

  it("reports a failed dry-run without publishing", async () => {
    const result = io(JSON.stringify([source]));
    await expect(
      runIngestionCli(["--dry-run"], {
        ...result.dependencies,
        scan: async () => ({ ok: false, reason: "STRUCTURE_CHANGED" }),
      }),
    ).resolves.toBe(1);
    expect(result.publish).not.toHaveBeenCalled();
    expect(result.errors.join(" ")).toMatch(/structure_changed/i);
  });

  it("reports a failed publishing run without leaking an underlying error", async () => {
    const result = io(JSON.stringify([source]));
    await expect(
      runIngestionCli([], {
        ...result.dependencies,
        publish: async () => {
          throw new Error("postgresql://secret");
        },
      }),
    ).resolves.toBe(1);
    expect(result.errors.join(" ")).toContain("Ingestion run failed.");
    expect(result.errors.join(" ")).not.toContain("secret");
  });

  it("requires an active configured adapter source", async () => {
    const result = io(JSON.stringify([{ ...source, status: "PAUSED" }]));
    await expect(runIngestionCli([], result.dependencies)).resolves.toBe(1);
    expect(result.errors.join(" ")).toMatch(/not active/i);
    expect(result.publish).not.toHaveBeenCalled();
  });
});
