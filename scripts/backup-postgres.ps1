[CmdletBinding()]
param(
  [switch]$Help,
  [string]$ConnectionString,
  [string]$OutputPath
)

if ($Help) {
  Write-Output "Usage: .\scripts\backup-postgres.ps1 -ConnectionString <secure postgres URL> -OutputPath <new .dump path>"
  Write-Output "The command writes a custom-format pg_dump and never resets or modifies the source database."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ConnectionString) -or [string]::IsNullOrWhiteSpace($OutputPath)) {
  throw "ConnectionString and OutputPath are required. Use -Help for usage."
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
if ([IO.Path]::GetExtension($resolvedOutput) -ne ".dump") { throw "OutputPath must end with .dump." }
if ([IO.File]::Exists($resolvedOutput)) { throw "OutputPath already exists; refusing to overwrite a backup." }
$pgDump = Get-Command pg_dump -ErrorAction Stop

& $pgDump.Source --dbname=$ConnectionString --format=custom --no-owner --file=$resolvedOutput
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
Write-Output ("Backup created: " + [IO.Path]::GetFileName($resolvedOutput))
