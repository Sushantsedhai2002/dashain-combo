import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runCheckLiveCli } from "./check-live.ts";
import { isPublicIpAddress } from "./public-ip.mjs";

const invocationDirectory = process.env.INIT_CWD ?? process.cwd();

process.exitCode = await runCheckLiveCli(
  process.argv.slice(2),
  {
    readTextFile: (path) => readFile(resolve(invocationDirectory, path), "utf8"),
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message),
  },
  {
    request: (url, options) => fetch(url, options),
    resolveHostname: async (hostname) => {
      const addresses = await lookup(hostname, { all: true });
      return addresses.map(({ address }) => address);
    },
    isPublicIpAddress,
    createAbortController: () => new AbortController(),
    setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimer: (timer) => clearTimeout(timer),
  },
);
