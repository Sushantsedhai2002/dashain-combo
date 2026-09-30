import pg from "pg";

import { CatalogMigrationError } from "../postgres/errors.ts";
import { runMigrations } from "../postgres/migrate.ts";

type Environment = Readonly<Record<string, string | undefined>>;

type MigrateCliDependencies = Readonly<{
  migrate: (databaseUrl: string) => Promise<readonly string[]>;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}>;

export async function migrateDatabase(
  databaseUrl: string,
  migrationsDirectory: string,
): Promise<readonly string[]> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    return await runMigrations({ pool, migrationsDirectory });
  } finally {
    await pool.end();
  }
}

export async function runMigrateCli(
  environment: Environment,
  dependencies: MigrateCliDependencies,
): Promise<number> {
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    dependencies.stderr("DATABASE_URL is required.\n");
    return 1;
  }

  try {
    const applied = await dependencies.migrate(databaseUrl);
    if (applied.length === 0) {
      dependencies.stdout("No pending migrations.\n");
    } else {
      const noun = applied.length === 1 ? "migration" : "migrations";
      dependencies.stdout(`Applied ${applied.length} ${noun}: ${applied.join(", ")}\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof CatalogMigrationError) {
      dependencies.stderr("Catalog migration failed.\n");
      return 1;
    }
    dependencies.stderr("Catalog migration failed.\n");
    return 1;
  }
}
