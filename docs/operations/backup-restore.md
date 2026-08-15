# Backup and restore drill

Backups are encrypted and stored outside the application host according to deployment policy. Application keyrings are backed up separately through secret management and never placed in a dump or log.

Create a new custom-format backup without overwriting an existing file:

```powershell
.\scripts\backup-postgres.ps1 -ConnectionString $env:BACKUP_DATABASE_URL -OutputPath .\private-backups\flowyn-<timestamp>.dump
```

Run the drill only against a disposable, explicitly confirmed target:

```powershell
.\scripts\restore-drill.ps1 -BackupPath .\private-backups\flowyn-<timestamp>.dump -TemporaryDatabaseUrl $env:RESTORE_DATABASE_URL -TemporaryTargetConfirmed
```

Verify the restored migration journal, workspace rows, encrypted webhook/integration/AI material with matching keyrings, workflow outbox state, readiness, and safe decryption paths. Record RPO/RTO evidence before claiming backup readiness. Never use production `DATABASE_URL` as the restore target.
