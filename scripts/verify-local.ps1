[CmdletBinding()]
param(
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot

function Invoke-RequiredCommand {
  param(
    [string]$Command,
    [string[]]$Arguments
  )
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function Wait-HttpEndpoint {
  param(
    [string]$Url,
    [int]$Timeout = $TimeoutSeconds
  )
  $deadline = (Get-Date).AddSeconds($Timeout)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        Write-Host "PASS $Url"
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $Url."
}

try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not installed or not available on PATH. Install Docker Desktop, restart PowerShell, and run this script again."
  }

  Write-Host "Validating Compose configuration..."
  Invoke-RequiredCommand "docker" @("compose", "config")

  Write-Host "Starting local services..."
  Invoke-RequiredCommand "docker" @("compose", "up", "-d", "--build")

  Wait-HttpEndpoint "http://localhost:3000/api/health"
  Wait-HttpEndpoint "http://localhost:3000/api/health/postgres"
  Wait-HttpEndpoint "http://localhost:3000/api/health/redis"
  Wait-HttpEndpoint "http://localhost:11434/api/tags"
  Wait-HttpEndpoint "http://localhost:3000/api/health/ollama"

  Write-Host "Applying PostgreSQL migrations..."
  Invoke-RequiredCommand "docker" @("compose", "exec", "-T", "app", "npm", "run", "db:migrate")

  Write-Host "Running host static checks and tests..."
  Invoke-RequiredCommand "npm" @("run", "typecheck")
  Invoke-RequiredCommand "npm" @("run", "lint")
  Invoke-RequiredCommand "npm" @("test", "--", "--run")
  Invoke-RequiredCommand "npm" @("run", "build")

  Write-Host "Milestone 2 local verification passed."
} finally {
  Pop-Location
}
