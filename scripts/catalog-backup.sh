#!/bin/sh
set -eu
: "${DATABASE_URL:?Set DATABASE_URL}"
: "${1:?Usage: catalog-backup.sh destination.dump}"
umask 077
# --file avoids shell interpolation of credentials; pg_dump reads the connection from PGDATABASE.
PGDATABASE="$DATABASE_URL" pg_dump --format=custom --file="$1"
pg_restore --list "$1" >/dev/null
