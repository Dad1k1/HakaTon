#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mode="${1:-}"
if [[ "$mode" != '' && "$mode" != '--demo' ]]; then echo 'Usage: ./setup.sh [--demo]'; exit 1; fi
command -v docker >/dev/null || { echo 'Install Docker Desktop or Docker Engine with Compose.'; exit 1; }
docker compose version >/dev/null
if [[ ! -f .env ]]; then
 command -v openssl >/dev/null || { echo 'Install openssl to generate local secrets.'; exit 1; }
 umask 077
 db_password="$(openssl rand -hex 24)"
 auth_secret="$(openssl rand -hex 32)"
 admin_password="$(openssl rand -hex 16)"
 demo_password="$(openssl rand -hex 16)"
 cat > .env <<CONFIG
POSTGRES_USER=modus
POSTGRES_DB=modus
POSTGRES_PASSWORD=$db_password
DATABASE_URL=postgresql://modus:$db_password@localhost:5432/modus
NEXTAUTH_SECRET=$auth_secret
ADMIN_LOGIN=admin
ADMIN_PASSWORD=$admin_password
DEMO_PASSWORD=$demo_password
UPLOAD_DIR=.local/uploads
CONFIG
 echo 'Created .env. Initial temporary credentials are stored only in this file.'
fi
docker compose build
docker compose up -d db
docker compose run --rm migrate
docker compose --profile setup run --rm initialize
if [[ "$mode" == '--demo' ]]; then docker compose --profile setup run --rm demo; fi
docker compose up -d app
echo 'Ready: http://localhost:3000. Login: ADMIN_LOGIN / ADMIN_PASSWORD from .env.'
echo 'For demo accounts use DEMO_PASSWORD from .env. Change temporary passwords at first login.'
