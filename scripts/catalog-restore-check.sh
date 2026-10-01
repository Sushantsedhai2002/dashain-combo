#!/bin/sh
set -eu
: "${RESTORE_TEST_DATABASE_URL:?Set an empty disposable restore test database URL}"
: "${1:?Usage: catalog-restore-check.sh backup.dump}"
node --input-type=module - <<'JS'
const url = new URL(process.env.RESTORE_TEST_DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !decodeURIComponent(url.pathname.slice(1)).toLowerCase().includes("test")) throw new Error("Restore destination database name must contain test");
JS

PGDATABASE="$RESTORE_TEST_DATABASE_URL" pg_restore --exit-on-error --single-transaction "$1"
PGDATABASE="$RESTORE_TEST_DATABASE_URL" psql --no-psqlrc --set=ON_ERROR_STOP=1 --command='SELECT count(*) AS restored_offers FROM offers; SELECT count(*) AS restored_evidence FROM offers WHERE discovery IS NOT NULL;'
