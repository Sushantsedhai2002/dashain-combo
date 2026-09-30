import { describe, expect, it, vi } from "vitest";

import {
  checkLiveChannels,
  runCheckLiveCli,
  type LiveCheckDependencies,
} from "../src/cli/check-live.ts";
import type { SourceDefinition } from "@dashain-offer/source-registry";

const firstSource: SourceDefinition = {
  id: "store-one",
  displayName: "Store One",
  status: "ACTIVE",
  supportedMarkets: ["NP"],
  marketSegments: ["general-retail"],
  channels: [
    { kind: "WEBSITE", url: "https://one.example.com/", isEnabled: true },
    { kind: "FACEBOOK", url: "https://facebook.com/store-one", isEnabled: false },
  ],
  verification: {
    verifiedAt: "2026-09-29T12:00:00.000Z",
    evidenceUrl: "https://one.example.com/about",
  },
};

const sources: readonly SourceDefinition[] = [
  firstSource,
  {
    id: "store-two",
    displayName: "Store Two",
    status: "PAUSED",
    supportedMarkets: ["NP"],
    marketSegments: ["electronics-retail"],
    channels: [
      { kind: "INSTAGRAM", url: "https://instagram.com/store-two", isEnabled: true },
      { kind: "TIKTOK", url: "https://tiktok.com/@store-two", isEnabled: true },
    ],
    verification: null,
  },
];

function dependencies(
  request: LiveCheckDependencies["request"] = async () => ({ status: 200 }),
): LiveCheckDependencies {
  return {
    request,
    resolveHostname: async () => ["8.8.8.8"],
    isPublicIpAddress: () => true,
    createAbortController: () => ({ signal: {}, abort: vi.fn() }),
    setTimer: () => 1,
    clearTimer: () => undefined,
  };
}

describe("checkLiveChannels", () => {
  it("checks only enabled channels and preserves registry order", async () => {
    const request = vi
      .fn<LiveCheckDependencies["request"]>()
      .mockResolvedValueOnce({ status: 200 })
      .mockImplementationOnce(() => {
        throw new Error("connection refused");
      })
      .mockResolvedValueOnce({ status: 503 });

    const results = await checkLiveChannels(sources, dependencies(request), {
      concurrency: 2,
      timeoutMs: 1_000,
    });

    expect(results).toEqual([
      {
        category: "REACHABLE",
        sourceId: "store-one",
        kind: "WEBSITE",
        url: "https://one.example.com/",
        status: 200,
      },
      {
        category: "NETWORK_ERROR",
        sourceId: "store-two",
        kind: "INSTAGRAM",
        url: "https://instagram.com/store-two",
      },
      {
        category: "REACHABLE",
        sourceId: "store-two",
        kind: "TIKTOK",
        url: "https://tiktok.com/@store-two",
        status: 503,
      },
    ]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: "HEAD",
      redirect: "manual",
      addresses: ["8.8.8.8"],
    });
  });

  it("never exceeds the configured concurrency", async () => {
    let active = 0;
    let maximumActive = 0;
    let pendingReleases: (() => void)[] = [];
    const request = vi.fn<LiveCheckDependencies["request"]>(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => {
        pendingReleases.push(() => {
          active -= 1;
          resolve();
        });
        if (pendingReleases.length === 2) {
          const releases = pendingReleases;
          pendingReleases = [];
          void Promise.resolve().then(() => {
            for (const release of releases) release();
          });
        }
      });
      return { status: 200 };
    });
    const manySources: readonly SourceDefinition[] = Array.from({ length: 6 }, (_, index) => ({
      ...firstSource,
      id: `store-${index}`,
      channels: [
        {
          kind: "WEBSITE" as const,
          url: `https://store-${index}.example.com/`,
          isEnabled: true,
        },
      ],
    }));

    await checkLiveChannels(manySources, dependencies(request), {
      concurrency: 2,
      timeoutMs: 1_000,
    });

    expect(maximumActive).toBe(2);
  });

  it("aborts and categorizes a request when its timeout expires", async () => {
    let expire: (() => void) | undefined;
    const abort = vi.fn();
    const request = vi.fn<LiveCheckDependencies["request"]>();
    const deps: LiveCheckDependencies = {
      ...dependencies(request),
      resolveHostname: () => new Promise(() => undefined),
      createAbortController: () => ({ signal: {}, abort }),
      setTimer: (callback) => {
        expire = callback;
        return 1;
      },
      clearTimer: vi.fn(),
    };

    const pending = checkLiveChannels([firstSource], deps, {
      concurrency: 1,
      timeoutMs: 50,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(expire).toBeTypeOf("function");
    expire?.();

    await expect(pending).resolves.toEqual([
      {
        category: "TIMEOUT",
        sourceId: "store-one",
        kind: "WEBSITE",
        url: "https://one.example.com/",
      },
    ]);
    expect(abort).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });

  it("blocks channels resolving to private addresses without requesting them", async () => {
    const request = vi.fn<LiveCheckDependencies["request"]>();
    const deps = {
      ...dependencies(request),
      resolveHostname: vi.fn(async () => ["127.0.0.1"]),
      isPublicIpAddress: () => false,
    };

    const results = await checkLiveChannels([firstSource], deps, {
      concurrency: 1,
      timeoutMs: 1_000,
    });

    expect(results[0]?.category).toBe("BLOCKED");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("runCheckLiveCli", () => {
  it("requires explicit live opt-in before reading or requesting", async () => {
    const io = {
      readTextFile: vi.fn(async () => JSON.stringify(sources)),
      stdout: vi.fn(),
      stderr: vi.fn(),
    };
    const deps = dependencies(vi.fn());

    const exitCode = await runCheckLiveCli([], io, deps);

    expect(exitCode).toBe(2);
    expect(io.readTextFile).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
    expect(io.stderr).toHaveBeenCalledWith(
      "Usage: sources:check --live [--file <registry.json>]\n",
    );
  });

  it("reports every result and states that reachability is not authenticity", async () => {
    const io = {
      readTextFile: vi.fn(async () => JSON.stringify(sources)),
      stdout: vi.fn(),
      stderr: vi.fn(),
    };
    const request = vi
      .fn<LiveCheckDependencies["request"]>()
      .mockResolvedValueOnce({ status: 204 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ status: 404 });

    const exitCode = await runCheckLiveCli(
      ["--", "--live", "--file", "registry.json"],
      io,
      dependencies(request),
    );

    expect(exitCode).toBe(0);
    expect(io.stdout.mock.calls.map(([message]) => message)).toEqual([
      "REACHABLE store-one WEBSITE https://one.example.com/ HTTP 204\n",
      "NETWORK_ERROR store-two INSTAGRAM https://instagram.com/store-two\n",
      "REACHABLE store-two TIKTOK https://tiktok.com/@store-two HTTP 404\n",
      "Live check complete: 3 enabled channels checked; 2 reachable. Reachability does not verify official identity.\n",
    ]);
    expect(io.stderr).not.toHaveBeenCalled();
  });
});
