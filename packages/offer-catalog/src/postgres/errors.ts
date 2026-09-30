export type CatalogMigrationErrorCode =
  "MIGRATION_CHECKSUM_MISMATCH" | "MIGRATION_DIRECTORY_INVALID" | "MIGRATION_FAILED";

export class CatalogMigrationError extends Error {
  readonly code: CatalogMigrationErrorCode;

  constructor(code: CatalogMigrationErrorCode, message: string) {
    super(message);
    this.name = "CatalogMigrationError";
    this.code = code;
  }
}

export class CatalogStorageError extends Error {
  constructor(message = "Catalog storage operation failed") {
    super(message);
    this.name = "CatalogStorageError";
  }
}
