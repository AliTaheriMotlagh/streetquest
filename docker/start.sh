#!/bin/sh
# The app container's start: make the database tables match prisma/schema.prisma (what scripts/db-sync.mjs does
# on other hosts), then run the Next.js standalone server. Retries while Postgres is still starting.
set -e
export DATABASE_URL_UNPOOLED="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}"
n=0
until node /tools/node_modules/prisma/build/index.js db push --skip-generate --schema prisma/schema.prisma; do
  n=$((n + 1))
  [ "$n" -ge 10 ] && { echo "[start] database schema sync failed"; exit 1; }
  echo "[start] database not ready, retrying in 3 s"
  sleep 3
done
exec node server.js
