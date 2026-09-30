export const DEFAULT_TEST_DATABASE_URL =
  "postgresql://dashain:dashain_test_only@127.0.0.1:55432/dashain_offer_catalog_test";

const SAFETY_MESSAGE = "Integration database name must contain test";

export function databaseNameFromUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      throw new Error(SAFETY_MESSAGE);
    }

    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (databaseName === "") throw new Error(SAFETY_MESSAGE);
    return databaseName;
  } catch {
    throw new Error(SAFETY_MESSAGE);
  }
}

export function assertSafeTestDatabaseUrl(value: string): void {
  if (!databaseNameFromUrl(value).toLowerCase().includes("test")) {
    throw new Error(SAFETY_MESSAGE);
  }
}

export function testDatabaseUrl(): string {
  const value = process.env.CATALOG_TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  assertSafeTestDatabaseUrl(value);
  return value;
}
