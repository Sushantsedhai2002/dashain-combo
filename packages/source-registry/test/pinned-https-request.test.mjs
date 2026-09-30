import { describe, expect, it, vi } from "vitest";

import { createPinnedHttpsRequest } from "../src/cli/pinned-https-request.mjs";

function successfulRequestHarness(statusCode = 204) {
  let requestOptions;
  let responseHandler;
  const response = { resume: vi.fn(), statusCode };
  const request = {
    on: vi.fn(() => request),
    end: vi.fn(() => responseHandler(response)),
  };
  const startRequest = vi.fn((_url, options, onResponse) => {
    requestOptions = options;
    responseHandler = onResponse;
    return request;
  });

  return { request, requestOptions: () => requestOptions, response, startRequest };
}

const liveRequestOptions = {
  method: "HEAD",
  redirect: "manual",
  signal: {},
  addresses: ["8.8.8.8", "2606:4700:4700::1111"],
};

describe("createPinnedHttpsRequest", () => {
  it("connects through only the previously validated addresses", async () => {
    const harness = successfulRequestHarness();
    const request = createPinnedHttpsRequest(harness.startRequest);

    await expect(request("https://example.com/offers", liveRequestOptions)).resolves.toEqual({
      status: 204,
    });

    const options = harness.requestOptions();
    const firstAddressCallback = vi.fn();
    options.lookup("example.com", { family: 0 }, firstAddressCallback);
    expect(firstAddressCallback).toHaveBeenCalledWith(null, "8.8.8.8", 4);

    const allAddressesCallback = vi.fn();
    options.lookup("example.com", { all: true, family: 0 }, allAddressesCallback);
    expect(allAddressesCallback).toHaveBeenCalledWith(null, [
      { address: "8.8.8.8", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);

    const ipv6Callback = vi.fn();
    options.lookup("example.com", 6, ipv6Callback);
    expect(ipv6Callback).toHaveBeenCalledWith(null, "2606:4700:4700::1111", 6);
    expect(harness.startRequest).toHaveBeenCalledWith(
      "https://example.com/offers",
      expect.objectContaining({ method: "HEAD", signal: liveRequestOptions.signal }),
      expect.any(Function),
    );
    expect(harness.response.resume).toHaveBeenCalledOnce();
  });

  it("rejects an IP family that has no validated address", async () => {
    const harness = successfulRequestHarness();
    const request = createPinnedHttpsRequest(harness.startRequest);

    await request("https://example.com/", {
      ...liveRequestOptions,
      addresses: ["8.8.8.8"],
    });

    const callback = vi.fn();
    harness.requestOptions().lookup("example.com", { family: 6 }, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
  });

  it("propagates connection errors", async () => {
    const connectionError = new Error("connection failed");
    let errorHandler;
    const outgoingRequest = {
      on: vi.fn((_event, handler) => {
        errorHandler = handler;
        return outgoingRequest;
      }),
      end: vi.fn(() => errorHandler(connectionError)),
    };
    const startRequest = vi.fn(() => outgoingRequest);
    const request = createPinnedHttpsRequest(startRequest);

    await expect(request("https://example.com/", liveRequestOptions)).rejects.toBe(connectionError);
  });
});
