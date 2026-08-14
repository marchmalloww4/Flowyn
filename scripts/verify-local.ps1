[CmdletBinding()]
param(
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
$previousRunOllamaIntegration = $env:RUN_OLLAMA_INTEGRATION
$previousRunAgentIntegration = $env:RUN_AGENT_INTEGRATION

$dockerCommand = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $dockerCommand) {
  $localDockerCommand = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
  if (Test-Path -LiteralPath $localDockerCommand) { $dockerCommand = $localDockerCommand }
}
$npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source

function Assert-DatabaseSchema {
  param(
    [string]$DatabaseName
  )

  $query = @"
SELECT 'vector_extension=' || EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector');
SELECT 'knowledge_documents=' || (to_regclass('public.knowledge_documents') IS NOT NULL);
SELECT 'knowledge_chunks=' || (to_regclass('public.knowledge_chunks') IS NOT NULL);
SELECT 'agent_tables=' || (to_regclass('public.agents') IS NOT NULL AND to_regclass('public.agent_runs') IS NOT NULL AND to_regclass('public.agent_run_steps') IS NOT NULL);
SELECT 'agent_deleted_at=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agents' AND column_name = 'deleted_at');
SELECT 'agent_status_check=' || EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_runs_status_check');
SELECT 'agent_step_type_check=' || EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_run_steps_type_check');
SELECT 'agent_indexes=' || (to_regclass('public.agents_workspace_idx') IS NOT NULL AND to_regclass('public.agent_runs_status_idx') IS NOT NULL AND to_regclass('public.agent_run_steps_run_idx') IS NOT NULL);
SELECT 'embedding_dimension=' || COALESCE((SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid WHERE c.relname = 'knowledge_chunks' AND a.attname = 'embedding' AND NOT a.attisdropped), 'missing');
SELECT 'hnsw_cosine=' || EXISTS (SELECT 1 FROM pg_class idx JOIN pg_index i ON i.indexrelid = idx.oid JOIN pg_am am ON am.oid = idx.relam JOIN pg_opclass opc ON opc.oid = ANY(i.indclass) WHERE idx.relname = 'knowledge_chunks_embedding_hnsw_idx' AND am.amname = 'hnsw' AND opc.opcname = 'vector_cosine_ops');
SELECT 'foreign_keys=' || ((SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name IN ('knowledge_documents', 'knowledge_chunks') AND constraint_type = 'FOREIGN KEY') >= 5);
SELECT 'status_check=' || EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_documents_status_check');
SELECT 'legacy_tables=' || (to_regclass('public.user') IS NOT NULL AND to_regclass('public.workspaces') IS NOT NULL AND to_regclass('public.brands') IS NOT NULL AND to_regclass('public.generation_logs') IS NOT NULL);
"@
  $output = & $dockerCommand compose exec -T postgres psql -U flowyn -d $DatabaseName -Atc $query
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL schema inspection failed for database $DatabaseName." }
  $checks = @($output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
  $required = @(
    "vector_extension=true",
    "knowledge_documents=true",
    "knowledge_chunks=true",
    "agent_tables=true",
    "agent_deleted_at=true",
    "agent_status_check=true",
    "agent_step_type_check=true",
    "agent_indexes=true",
    "embedding_dimension=vector(768)",
    "hnsw_cosine=true",
    "foreign_keys=true",
    "status_check=true",
    "legacy_tables=true"
  )
  foreach ($expected in $required) {
    if ($checks -notcontains $expected) { throw "PostgreSQL schema check failed for ${DatabaseName}: expected $expected, got $($checks -join ', ')." }
  }
  Write-Host "PASS PostgreSQL schema checks for $DatabaseName"
}

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
  if (-not $dockerCommand) {
    throw "Docker is not installed or not available on PATH. Install Docker Desktop, restart PowerShell, and run this script again."
  }
  if (-not $npmCommand) { throw "npm.cmd is not available on PATH. Install Node.js and restart PowerShell." }

  Write-Host "Validating Compose configuration..."
  Invoke-RequiredCommand $dockerCommand @("compose", "config")

  Write-Host "Starting local services..."
  Invoke-RequiredCommand $dockerCommand @("compose", "up", "-d", "--build")

  Wait-HttpEndpoint "http://localhost:3000/api/health"
  Wait-HttpEndpoint "http://localhost:3000/api/health/postgres"
  Wait-HttpEndpoint "http://localhost:3000/api/health/redis"
  Wait-HttpEndpoint "http://localhost:11434/api/tags"
  Wait-HttpEndpoint "http://localhost:3000/api/health/ollama"

  Write-Host "Checking the verified local embedding model..."
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "ollama", "ollama", "show", "nomic-embed-text")

  Write-Host "Verifying the live embedding dimension and finite vector values..."
  $embeddingBody = @{ model = "nomic-embed-text"; input = "Flowyn Milestone 4 verification" } | ConvertTo-Json -Compress
  $embeddingResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:11434/api/embed" -ContentType "application/json" -Body $embeddingBody -TimeoutSec 30
  if ($embeddingResponse.model -ne "nomic-embed-text") {
    throw "The embedding response used an unexpected model."
  }
  $embeddingVector = @($embeddingResponse.embeddings[0])
  if ($embeddingVector.Count -ne 768) {
    throw "The verified embedding dimension was $($embeddingVector.Count), expected 768."
  }
  foreach ($value in $embeddingVector) {
    $number = 0.0
    if (-not [double]::TryParse([string]$value, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number) -or [double]::IsNaN($number) -or [double]::IsInfinity($number)) {
      throw "The embedding response contained a non-finite value."
    }
  }

  Write-Host "Applying PostgreSQL migrations..."
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "app", "npm", "run", "db:migrate")
  Assert-DatabaseSchema "flowyn"

  Write-Host "Applying migrations to a temporary clean database..."
  $temporaryDatabase = "flowyn_milestone5_verify"
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "postgres", "dropdb", "--if-exists", "-U", "flowyn", $temporaryDatabase)
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "postgres", "createdb", "-U", "flowyn", $temporaryDatabase)
  try {
    $temporaryDatabaseUrl = "postgres://flowyn:flowyn@postgres:5432/$temporaryDatabase"
    Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "app", "sh", "-c", "DATABASE_URL=$temporaryDatabaseUrl npm run db:migrate")
    Assert-DatabaseSchema $temporaryDatabase
  } finally {
    Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "postgres", "dropdb", "--if-exists", "-U", "flowyn", $temporaryDatabase)
  }

  Write-Host "Running host static checks and tests..."
  $env:RUN_OLLAMA_INTEGRATION = "1"
  $env:RUN_AGENT_INTEGRATION = "1"
  Write-Host "Running Ollama/pgvector integrations sequentially to avoid local model contention..."
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run", "tests/ollama-embedding.integration.test.ts", "tests/knowledge.integration.test.ts")
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run", "tests/agent.integration.test.ts")
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run", "tests/agent-ollama.integration.test.ts")
  Remove-Item Env:RUN_OLLAMA_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_AGENT_INTEGRATION -ErrorAction SilentlyContinue
  Invoke-RequiredCommand $npmCommand @("run", "typecheck")
  Invoke-RequiredCommand $npmCommand @("run", "lint")
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run")
  Invoke-RequiredCommand $npmCommand @("run", "build")

  Write-Host "Milestone 5 local verification passed."
} finally {
  if ($null -eq $previousRunOllamaIntegration) { Remove-Item Env:RUN_OLLAMA_INTEGRATION -ErrorAction SilentlyContinue }
  else { $env:RUN_OLLAMA_INTEGRATION = $previousRunOllamaIntegration }
  if ($null -eq $previousRunAgentIntegration) { Remove-Item Env:RUN_AGENT_INTEGRATION -ErrorAction SilentlyContinue }
  else { $env:RUN_AGENT_INTEGRATION = $previousRunAgentIntegration }
  Pop-Location
}
