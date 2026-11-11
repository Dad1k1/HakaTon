$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Invoke-Docker { & docker @args; if ($LASTEXITCODE -ne 0) { throw "Docker failed ($LASTEXITCODE)." } }
if ((Test-Path backups/modus.dump) -or (Test-Path backups/uploads.tar.gz)) { throw 'Move existing backups/ to a dated directory first.' }
New-Item -ItemType Directory -Force backups | Out-Null
$backupDir = (Resolve-Path backups).Path
Invoke-Docker compose stop app
try {
  Invoke-Docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/modus.dump'
  Invoke-Docker compose cp db:/tmp/modus.dump ./backups/modus.dump
  Invoke-Docker compose run --rm --no-deps --user root --entrypoint tar -v "${backupDir}:/backup" app -czf /backup/uploads.tar.gz -C /app/uploads .
  Write-Host 'Saved backups/modus.dump and backups/uploads.tar.gz. Protect .env separately.'
} finally { Invoke-Docker compose up -d app }
