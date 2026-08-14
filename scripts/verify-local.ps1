[CmdletBinding()]
param(
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
$previousRunOllamaIntegration = $env:RUN_OLLAMA_INTEGRATION
$previousRunAgentIntegration = $env:RUN_AGENT_INTEGRATION
$previousRunWorkflowIntegration = $env:RUN_WORKFLOW_INTEGRATION
$previousRunWorkflowOllamaIntegration = $env:RUN_WORKFLOW_OLLAMA_INTEGRATION
$previousRunSchedulerIntegration = $env:RUN_SCHEDULER_INTEGRATION
$previousRunWebhookIntegration = $env:RUN_WEBHOOK_INTEGRATION
$previousRunApprovalIntegration = $env:RUN_APPROVAL_INTEGRATION

$dockerCommand = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $dockerCommand) {
  $localDockerCommand = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
  if (Test-Path -LiteralPath $localDockerCommand) { $dockerCommand = $localDockerCommand }
}
$npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source

function Assert-DatabaseSchema {
  param(
    [string]$DatabaseName,
    [int]$ExpectedEmbeddingDimension
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
SELECT 'workflow_tables=' || (to_regclass('public.workflows') IS NOT NULL AND to_regclass('public.workflow_versions') IS NOT NULL AND to_regclass('public.workflow_runs') IS NOT NULL AND to_regclass('public.workflow_step_runs') IS NOT NULL AND to_regclass('public.workflow_run_dispatches') IS NOT NULL);
SELECT 'workflow_status_checks=' || (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_runs_status_check') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_step_runs_status_check') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_run_dispatches_status_check'));
SELECT 'workflow_version_unique=' || (to_regclass('public.workflow_versions_workflow_version_idx') IS NOT NULL);
SELECT 'workflow_idempotency_unique=' || (to_regclass('public.workflow_runs_workspace_idempotency_idx') IS NOT NULL);
SELECT 'workflow_step_execution_token=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_step_runs' AND column_name = 'execution_token');
SELECT 'workflow_dispatch_fields=' || (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_run_dispatches' AND column_name = 'lease_expires_at') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_run_dispatches' AND column_name = 'dispatcher_id'));
SELECT 'workflow_indexes=' || (to_regclass('public.workflow_runs_status_idx') IS NOT NULL AND to_regclass('public.workflow_step_runs_attempt_idx') IS NOT NULL AND to_regclass('public.workflow_run_dispatches_status_idx') IS NOT NULL);
SELECT 'schedule_tables=' || (to_regclass('public.workflow_schedules') IS NOT NULL AND to_regclass('public.workflow_schedule_occurrences') IS NOT NULL);
SELECT 'schedule_occurrence_unique=' || (to_regclass('public.workflow_schedule_occurrences_schedule_scheduled_idx') IS NOT NULL);
SELECT 'schedule_constraints=' || (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_schedules_type_check') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_schedule_occurrences_status_check'));
SELECT 'webhook_tables=' || (to_regclass('public.workflow_webhook_triggers') IS NOT NULL AND to_regclass('public.workflow_webhook_events') IS NOT NULL);
SELECT 'webhook_public_id_unique=' || (to_regclass('public.workflow_webhook_triggers_public_id_idx') IS NOT NULL);
SELECT 'webhook_dedupe_unique=' || (to_regclass('public.workflow_webhook_events_trigger_dedupe_idx') IS NOT NULL);
SELECT 'webhook_constraints=' || (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_webhook_events_status_check') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_webhook_triggers_secret_version_check'));
SELECT 'approval_tables=' || (to_regclass('public.workflow_approval_requests') IS NOT NULL);
SELECT 'approval_unique=' || (to_regclass('public.workflow_approval_requests_run_step_idx') IS NOT NULL);
SELECT 'approval_constraints=' || (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_approval_requests_status_check') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_approval_requests_role_check') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_approval_requests_expiry_check'));
SELECT 'approval_dispatch_generation=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workflow_run_dispatches' AND column_name = 'dispatch_generation');
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
    "embedding_dimension=vector($ExpectedEmbeddingDimension)",
    "hnsw_cosine=true",
    "foreign_keys=true",
    "status_check=true",
    "legacy_tables=true",
    "workflow_tables=true",
    "workflow_status_checks=true",
    "workflow_version_unique=true",
    "workflow_idempotency_unique=true",
    "workflow_step_execution_token=true",
    "workflow_dispatch_fields=true",
    "workflow_indexes=true",
    "schedule_tables=true",
    "schedule_occurrence_unique=true",
    "schedule_constraints=true",
    "webhook_tables=true",
    "webhook_public_id_unique=true",
    "webhook_dedupe_unique=true",
    "webhook_constraints=true",
    "approval_tables=true",
    "approval_unique=true",
    "approval_constraints=true",
    "approval_dispatch_generation=true"
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
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "worker", "npm", "run", "worker:health")
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "scheduler", "npm", "run", "scheduler:health")

  Write-Host "Checking the verified local embedding model..."
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "ollama", "ollama", "show", "nomic-embed-text")

  Write-Host "Verifying the live embedding dimension and finite vector values..."
  $embeddingBody = @{ model = "nomic-embed-text"; input = "Flowyn Milestone 4 verification" } | ConvertTo-Json -Compress
  $embeddingResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:11434/api/embed" -ContentType "application/json" -Body $embeddingBody -TimeoutSec 30
  if ($embeddingResponse.model -ne "nomic-embed-text") {
    throw "The embedding response used an unexpected model."
  }
  $embeddingVector = @($embeddingResponse.embeddings[0])
  if ($embeddingVector.Count -lt 1) {
    throw "The verified embedding dimension was empty."
  }
  $verifiedEmbeddingDimension = $embeddingVector.Count
  Write-Host "Verified nomic-embed-text dimension: $verifiedEmbeddingDimension"
  foreach ($value in $embeddingVector) {
    $number = 0.0
    if (-not [double]::TryParse([string]$value, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number) -or [double]::IsNaN($number) -or [double]::IsInfinity($number)) {
      throw "The embedding response contained a non-finite value."
    }
  }

  Write-Host "Applying PostgreSQL migrations..."
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "app", "npm", "run", "db:migrate")
  Assert-DatabaseSchema "flowyn" $verifiedEmbeddingDimension

  Write-Host "Applying migrations to a temporary clean database..."
  $temporaryDatabase = "flowyn_milestone9_verify"
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "postgres", "dropdb", "--if-exists", "-U", "flowyn", $temporaryDatabase)
  Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "postgres", "createdb", "-U", "flowyn", $temporaryDatabase)
  try {
    $temporaryDatabaseUrl = "postgres://flowyn:flowyn@postgres:5432/$temporaryDatabase"
    Invoke-RequiredCommand $dockerCommand @("compose", "exec", "-T", "app", "sh", "-c", "DATABASE_URL=$temporaryDatabaseUrl npm run db:migrate")
    Assert-DatabaseSchema $temporaryDatabase $verifiedEmbeddingDimension
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
  $env:RUN_WORKFLOW_INTEGRATION = "1"
  $env:RUN_WORKFLOW_OLLAMA_INTEGRATION = "1"
  $env:RUN_SCHEDULER_INTEGRATION = "1"
  $env:RUN_WEBHOOK_INTEGRATION = "1"
  $env:RUN_APPROVAL_INTEGRATION = "1"
  Write-Host "Running durable workflow, scheduler, webhook, and approval integrations sequentially..."
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run", "tests/workflow.integration.test.ts")
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run", "tests/workflow-ollama.integration.test.ts")
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run", "tests/scheduling.integration.test.ts")
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run", "tests/webhook.integration.test.ts")
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run", "tests/workflow-approval.integration.test.ts")
  Remove-Item Env:RUN_OLLAMA_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_AGENT_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_WORKFLOW_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_WORKFLOW_OLLAMA_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_SCHEDULER_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_WEBHOOK_INTEGRATION -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_APPROVAL_INTEGRATION -ErrorAction SilentlyContinue
  Invoke-RequiredCommand $npmCommand @("run", "typecheck")
  Invoke-RequiredCommand $npmCommand @("run", "lint")
  Invoke-RequiredCommand $npmCommand @("test", "--", "--run")
  Invoke-RequiredCommand $npmCommand @("run", "build")

  Write-Host "Milestone 9 local verification passed."
} finally {
  if ($null -eq $previousRunOllamaIntegration) { Remove-Item Env:RUN_OLLAMA_INTEGRATION -ErrorAction SilentlyContinue }
  else { $env:RUN_OLLAMA_INTEGRATION = $previousRunOllamaIntegration }
  if ($null -eq $previousRunAgentIntegration) { Remove-Item Env:RUN_AGENT_INTEGRATION -ErrorAction SilentlyContinue }
  else { $env:RUN_AGENT_INTEGRATION = $previousRunAgentIntegration }
  if ($null -eq $previousRunWorkflowIntegration) { Remove-Item Env:RUN_WORKFLOW_INTEGRATION -ErrorAction SilentlyContinue }
  else { $env:RUN_WORKFLOW_INTEGRATION = $previousRunWorkflowIntegration }
  if ($null -eq $previousRunWorkflowOllamaIntegration) { Remove-Item Env:RUN_WORKFLOW_OLLAMA_INTEGRATION -ErrorAction SilentlyContinue }
  else { $env:RUN_WORKFLOW_OLLAMA_INTEGRATION = $previousRunWorkflowOllamaIntegration }
  if ($null -eq $previousRunSchedulerIntegration) { Remove-Item Env:RUN_SCHEDULER_INTEGRATION -ErrorAction SilentlyContinue }
  else { $env:RUN_SCHEDULER_INTEGRATION = $previousRunSchedulerIntegration }
  if ($null -eq $previousRunWebhookIntegration) { Remove-Item Env:RUN_WEBHOOK_INTEGRATION -ErrorAction SilentlyContinue }
  else { $env:RUN_WEBHOOK_INTEGRATION = $previousRunWebhookIntegration }
  if ($null -eq $previousRunApprovalIntegration) { Remove-Item Env:RUN_APPROVAL_INTEGRATION -ErrorAction SilentlyContinue }
  else { $env:RUN_APPROVAL_INTEGRATION = $previousRunApprovalIntegration }
  Pop-Location
}
