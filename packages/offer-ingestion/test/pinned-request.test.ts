import { EventEmitter } from "node:events";
import type { IncomingMessage, ClientRequest, RequestOptions } from "node:http";
import type { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createPinnedRequest } from "../src/http/pinned-request.ts";

function fakeTransport(
  status: number,
  body: string,
  headers: Record<string, string> = { "content-type": "text/html" },
) {
  let options: RequestOptions | undefined;
  const startRequest = ((
    _url: string,
    requestOptions: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => {
    options = requestOptions;
    const request = new EventEmitter() as ClientRequest;
    request.end = (() => {
      const response = Readable.from([Buffer.from(body)]) as IncomingMessage;
      response.statusCode = status;
      response.headers = headers;
      callback(response);
      return request;
    }) as ClientRequest["end"];
    return request;
  }) as typeof httpsRequest;
  return { request: createPinnedRequest(startRequest), getOptions: () => options };
}

describe("pinned HTTPS transport", () => {
  it("negotiates anonymous JSON without adding credentials or changing GET semantics", async () => {
    const transport = fakeTransport(200, "[]", { "content-type": "application/json" });
    await expect(
      transport.request("https://merchant.test/api/offers", ["8.8.8.8"], 1000, 100),
    ).resolves.toMatchObject({ body: "[]", contentType: "application/json" });
    expect(transport.getOptions()?.method).toBe("GET");
    expect(transport.getOptions()?.headers).toMatchObject({
      Accept: expect.stringContaining("application/json"),
    });
    expect(transport.getOptions()?.headers).not.toHaveProperty("Authorization");
  });
  it("returns bounded HTML and pins lookup to the validated address", async () => {
    const transport = fakeTransport(200, "<html>offer</html>");
    await expect(
      transport.request("https://evostore.com.np/special-offers", ["8.8.8.8"], 1000, 100),
    ).resolves.toEqual({
      status: 200,
      body: "<html>offer</html>",
      contentType: "text/html",
    });
    const lookup = transport.getOptions()?.lookup as (
      hostname: string,
      options: { family: number },
      callback: (error: Error | null, address: string) => void,
    ) => void;
    await new Promise<void>((resolve, reject) => {
      lookup("evostore.com.np", { family: 4 }, (error, address) => {
        if (error !== null) return reject(error);
        expect(address).toBe("8.8.8.8");
        resolve();
      });
    });
  });

  it("does not read or follow non-success responses", async () => {
    const transport = fakeTransport(404, "not found");
    await expect(
      transport.request("https://evostore.com.np/item", ["8.8.8.8"], 1000, 100),
    ).resolves.toEqual({
      status: 404,
      body: "",
      contentType: "text/html",
    });
  });

  it("rejects oversized content-length and streamed bodies", async () => {
    const declared = fakeTransport(200, "too big", {
      "content-type": "text/html",
      "content-length": "999",
    });
    await expect(
      declared.request("https://evostore.com.np/item", ["8.8.8.8"], 1000, 5),
    ).rejects.toThrow("Response too large");
    const streamed = fakeTransport(200, "too big");
    await expect(
      streamed.request("https://evostore.com.np/item", ["8.8.8.8"], 1000, 5),
    ).rejects.toThrow("Response too large");
  });

  it("rejects a requested IP family absent from validated DNS results", async () => {
    const transport = fakeTransport(200, "ok");
    await transport.request("https://evostore.com.np/item", ["8.8.8.8"], 1000, 100);
    const lookup = transport.getOptions()?.lookup as (
      hostname: string,
      options: { family: number },
      callback: (error: Error | null) => void,
    ) => void;
    await new Promise<void>((resolve) => {
      lookup("evostore.com.np", { family: 6 }, (error) => {
        expect(error).toBeInstanceOf(Error);
        resolve();
      });
    });
  });
});
