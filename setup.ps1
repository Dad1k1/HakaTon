param([switch]$Demo)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Invoke-Docker { & docker @args; if ($LASTEXITCODE -ne 0) { throw "Docker failed ($LASTEXITCODE)." } }
function New-Secret([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return ([BitConverter]::ToString($buffer)).Replace('-', '').ToLowerInvariant()
}
Invoke-Docker compose version
if (-not (Test-Path .env)) {
  $dbPassword = New-Secret 24
  $authSecret = New-Secret 32
  $adminPassword = New-Secret 16
  $demoPassword = New-Secret 16
  $config = @"
POSTGRES_USER=modus
POSTGRES_DB=modus
POSTGRES_PASSWORD=$dbPassword
DATABASE_URL=postgresql://modus:$dbPassword@localhost:5432/modus
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=$authSecret
ADMIN_LOGIN=admin
ADMIN_PASSWORD=$adminPassword
DEMO_PASSWORD=$demoPassword
UPLOAD_DIR=.local/uploads
"@
  [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $config, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'Created .env. Keep this file private: it contains local secrets and temporary passwords.'
}
Invoke-Docker compose build
Invoke-Docker compose up -d db
Invoke-Docker compose run --rm migrate
Invoke-Docker compose --profile setup run --rm initialize
if ($Demo) { Invoke-Docker compose --profile setup run --rm demo }
Invoke-Docker compose up -d app
Write-Host 'Ready: http://localhost:3000. Login: ADMIN_LOGIN / ADMIN_PASSWORD from .env.'
Write-Host 'For demo accounts use DEMO_PASSWORD from .env. Change temporary passwords at first login.'
