import { runIngestionCli } from "./ingest.ts";
import { createIngestionRuntime } from "./runtime.ts";

const runtime = createIngestionRuntime(process.env.DATABASE_URL, {
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
});

try {
  process.exitCode = await runIngestionCli(process.argv.slice(2), runtime.dependencies);
} finally {
  await runtime.close();
}
