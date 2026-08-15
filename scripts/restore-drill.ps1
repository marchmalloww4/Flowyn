[CmdletBinding()]
param(
  [switch]$Help,
  [string]$BackupPath,
  [string]$TemporaryDatabaseUrl,
  [switch]$TemporaryTargetConfirmed
)

if ($Help) {
  Write-Output "Usage: .\scripts\restore-drill.ps1 -BackupPath <dump> -TemporaryDatabaseUrl <isolated postgres URL> -TemporaryTargetConfirmed"
  Write-Output "The destination must be a disposable restore target. The application DATABASE_URL is never used implicitly."
  exit 0
}

if (-not $TemporaryTargetConfirmed) { throw "Refusing restore without -TemporaryTargetConfirmed." }
if ([string]::IsNullOrWhiteSpace($BackupPath) -or [string]::IsNullOrWhiteSpace($TemporaryDatabaseUrl)) { throw "BackupPath and TemporaryDatabaseUrl are required. Use -Help for usage." }
$resolvedBackup = [IO.Path]::GetFullPath($BackupPath)
if (-not [IO.File]::Exists($resolvedBackup)) { throw "Backup file does not exist." }
$applicationDatabaseUrl = $env:DATABASE_URL
if (-not [string]::IsNullOrWhiteSpace($applicationDatabaseUrl) -and $TemporaryDatabaseUrl -eq $applicationDatabaseUrl) { throw "Restore target must not equal the application database URL." }
$pgRestore = Get-Command pg_restore -ErrorAction Stop

& $pgRestore.Source --dbname=$TemporaryDatabaseUrl --no-owner --exit-on-error $resolvedBackup
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed." }
Write-Output "Restore drill completed against the explicitly confirmed temporary target. Verify readiness, migration journal, encrypted material, and outbox state before recording evidence."
