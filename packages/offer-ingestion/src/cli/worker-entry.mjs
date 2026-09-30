import { runIngestionCli } from "./ingest.ts";
import { createIngestionRuntime } from "./runtime.ts";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const runtime = createIngestionRuntime(process.env.DATABASE_URL, {
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
});

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    await runIngestionCli([], runtime.dependencies);
  } finally {
    running = false;
  }
}

await tick();
const timer = setInterval(tick, SIX_HOURS_MS);

process.on("SIGTERM", () => {
  clearInterval(timer);
  void runtime.close();
});
