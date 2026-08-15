# Flowyn — Supervisor Submission Checklist

This checklist is an evidence and preparation aid. A checked item must have a
dated, repository-backed or operator-backed record; an unchecked item is not a
pass. Do not place secrets, raw Slack responses, private key material, or real
user data in the submission package.

## Repository

- [ ] `master` contains the reviewed supervisor package commit.
- [ ] `master` is pushed and the remote branch is visible to the supervisor.
- [ ] Working tree is clean.
- [ ] `v1.0.0-rc.1` is visible remotely and points to qualified application commit `273346d`.
- [ ] No `v1.0.0` tag has been created without final release approval.
- [ ] The exact commit and RC tag are recorded in the submission evidence.

## Environment

- [ ] Docker Desktop and Compose v2 are available.
- [ ] Node.js `22.23.1` or newer is installed.
- [ ] A local environment file is prepared from `.env.example` and is not included in the submission.
- [ ] `BETTER_AUTH_SECRET` is unique for the environment and is not documented in screenshots.
- [ ] PostgreSQL is reachable through the documented Compose service.
- [ ] Redis is reachable through the documented Compose service.
- [ ] Ollama is reachable through the documented Compose service.
- [ ] Required database migrations have been applied.
- [ ] Required model provisioning has been completed for the demonstration environment.
- [ ] `INTEGRATION_EGRESS_ENABLED=false` is confirmed for the ordinary supervisor demo.

## Models

- [ ] `llama3.2:3b` is available in the intended Ollama environment.
- [ ] `nomic-embed-text` is available in the intended Ollama environment.
- [ ] A live embedding response has verified dimension `768`.
- [ ] The configured embedding dimension matches the pgvector schema contract.
- [ ] Missing models are treated as provisioning failures, not silently marked ready.

## Verification

- [ ] `npm run typecheck` passed.
- [ ] `npm run lint` passed.
- [ ] `npm test -- --run` passed with the recorded current count.
- [ ] `npm run build` passed.
- [ ] `docker compose config` passed.
- [ ] `docker compose ps` shows required local services healthy/running.
- [ ] `.\scripts\verify-local.ps1` passed.
- [ ] Liveness and readiness endpoints were checked.
- [ ] Worker heartbeat and `worker:health` were checked.
- [ ] Scheduler heartbeat and `scheduler:health` were checked.
- [ ] Browser smoke passed in the recorded supported-browser matrix.
- [ ] Accessibility checks found no serious or critical axe violations.
- [ ] Responsive checks covered 375px, 768px, and 1280px.
- [ ] Keyboard-only smoke and visible-focus checks passed.
- [ ] Current-database migration/preflight validation passed.
- [ ] Clean temporary-database migration/preflight validation passed.
- [ ] Backup/restore and recovery evidence is attached or linked.
- [ ] Production dependency audit has 0 critical and 0 high findings.
- [ ] The four remaining moderate findings have a documented disposition.

## Demo data

- [ ] Demonstration account is ready.
- [ ] Demonstration workspace is ready.
- [ ] Demonstration brand is ready.
- [ ] Demonstration knowledge document is ready.
- [ ] Demonstration AI prompt is synthetic and bounded.
- [ ] Demonstration agent is enabled with safe tools only.
- [ ] Demonstration workflow is ready.
- [ ] Demonstration visual-editor state is ready.
- [ ] Demonstration schedule or occurrence example is ready.
- [ ] Demonstration approval example is ready.
- [ ] Demonstration operations page is ready.
- [ ] Demonstration data contains no customer or personally sensitive information.

## Supervisor demonstration

- [ ] The 10–15 minute flow in [SUPERVISOR-DEMO.md](SUPERVISOR-DEMO.md) was rehearsed.
- [ ] Sign-in and sign-up paths are available.
- [ ] Workspace switching is available.
- [ ] Brand and knowledge/RAG surfaces are available.
- [ ] AI fallback explanation is prepared in case Ollama is slow.
- [ ] AgentRunner restrictions can be shown.
- [ ] Visual workflow Canvas and Advanced JSON views can be shown.
- [ ] Durable execution, scheduler, and worker explanations are prepared.
- [ ] Approval gate behavior can be shown without an external side effect.
- [ ] Integration catalog can be shown without entering a real credential.
- [ ] Usage, operations, readiness, and security controls can be shown.
- [ ] Test and recovery evidence links are ready.
- [ ] The release status statement is prepared and truthful.

## Submission package

- [ ] `README.md` links to the supervisor package.
- [ ] `ARCHITECTURE.md` is included.
- [ ] `SETUP.md` is included.
- [ ] `SECURITY.md` is included.
- [ ] `AI.md` is included.
- [ ] `docs/SUPERVISOR-SUBMISSION.md` is reviewed.
- [ ] `docs/SUPERVISOR-DEMO.md` is reviewed.
- [ ] `docs/SUPERVISOR-CHECKLIST.md` is reviewed.
- [ ] Known limitations and release status are included.
- [ ] The repository/GitHub URL is recorded separately from this package.
- [ ] The RC tag and qualified application commit are recorded.
- [ ] No generated reports, screenshots, traces, dumps, or runtime artifacts are included accidentally.

## Security

- [ ] No secrets are committed.
- [ ] No password, private key, keyring material, or connection string appears in the package.
- [ ] No Slack token appears in terminal history, screenshots, or submission notes.
- [ ] No `.env`, `.env.local`, or `.env.production` file is included.
- [ ] Egress is disabled unless a separately approved dedicated test is intentionally running.
- [ ] Only synthetic/demo data is used for the supervisor walkthrough.
- [ ] Better Auth remains authoritative.
- [ ] Workspace authorization remains server-side and workspace-isolated.
- [ ] Slack `post_message` remains the only connector operation.
- [ ] Human approval remains mandatory for integration actions.
- [ ] `AMBIGUOUS` integration outcomes remain terminal and non-retryable.
- [ ] AgentRunner has no integration tools.
- [ ] No generic HTTP, OAuth, arbitrary URL, shell, arbitrary SQL, filesystem, dynamic-code, or runtime-browser capability was added.

## Release truth

| Statement | Current status |
| --- | --- |
| M1–M15 implementation | COMPLETE |
| Technical RC qualification | PASS |
| Full-path dedicated Slack qualification | PASS |
| Qualified candidate | `v1.0.0-rc.1` |
| Controlled beta | NOT YET PERFORMED |
| External production deployment | NOT VERIFIED |
| Final `v1.0.0` release | NOT TAGGED / NOT APPROVED |

The project may be presented for supervisor evaluation as a technically
qualified release candidate. It must not be described as a completed production
deployment, completed controlled beta, or final `v1.0.0` release.
