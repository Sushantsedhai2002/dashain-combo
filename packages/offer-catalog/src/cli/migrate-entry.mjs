import { fileURLToPath } from "node:url";

import { migrateDatabase, runMigrateCli } from "./migrate.ts";

const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));

process.exitCode = await runMigrateCli(process.env, {
  migrate: (databaseUrl) => migrateDatabase(databaseUrl, migrationsDirectory),
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
});
