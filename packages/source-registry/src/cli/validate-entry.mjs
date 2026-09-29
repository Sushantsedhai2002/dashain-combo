import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runValidateCli } from "./validate.ts";

const invocationDirectory = process.env.INIT_CWD ?? process.cwd();

process.exitCode = await runValidateCli(process.argv.slice(2), {
  readTextFile: (path) => readFile(resolve(invocationDirectory, path), "utf8"),
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
});
