import { runIngestionCli } from "./ingest.ts";
import { createIngestionRuntime } from "./runtime.ts";

const POLL_MS = 5 * 60 * 1000;
const runtime = createIngestionRuntime(
  process.env.DATABASE_URL,
  {
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message),
  },
  { respectDueTimes: true },
);

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
const timer = setInterval(tick, POLL_MS);

process.on("SIGTERM", () => {
  clearInterval(timer);
  void runtime.close();
});
