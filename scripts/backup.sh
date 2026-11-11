#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
if [[ -e backups/modus.dump || -e backups/uploads.tar.gz ]]; then echo 'Move the existing backups/ to a dated directory before creating a new backup.' >&2; exit 1; fi
docker compose stop app
trap 'docker compose up -d app' EXIT
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/modus.dump'
docker compose cp db:/tmp/modus.dump ./backups/modus.dump
docker compose run --rm --no-deps --user root --entrypoint tar -v "$PWD/backups:/backup" app -czf /backup/uploads.tar.gz -C /app/uploads .
echo 'Saved backups/modus.dump and backups/uploads.tar.gz. Keep a protected copy of .env separately.'
