# Milestone 2 Multi-Tenant Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Flowyn’s PostgreSQL-backed multi-tenant foundation with role-aware workspace membership, centralized authorization, complete brand CRUD, audit logging, additive migrations, and verification without implementing later milestones.

**Architecture:** Preserve the modular monolith and existing Better Auth/Drizzle boundaries. Add a focused authorization module and separate workspace, membership, brand, and audit services; route handlers remain thin. Use additive Drizzle migrations and run them against the existing local PostgreSQL database without deleting volumes.

**Tech Stack:** Next.js route handlers, strict TypeScript, Drizzle ORM/PostgreSQL, Better Auth, Zod, Vitest, Docker Compose, Ollama health/generation regression checks.

**Spec:** `docs/superpowers/specs/2026-08-14-milestone-2-multitenant-foundation-design.md`

## Global Constraints

- Implement Milestone 2 only; do not implement RAG, embeddings, documents, agents, tools, workflows, queues, scheduling, webhooks, approvals, integrations, billing, or editor features.
- Preserve existing Milestone 1 behavior and API routes unless adding required authorization or deletion behavior.
- Never trust a client-provided user or workspace ID without server-side session and membership checks.
- Return non-leaking 404 responses for cross-workspace resources.
- Use Zod at every request-body boundary; do not use `eval`, `new Function`, shell execution, dependency upgrades, or destructive database resets.
- Do not delete Docker volumes or drop existing data.

## File Map

- `lib/database/schema.ts`: role-safe schema, indexes, constraints.
- `db/migrations/*`: generated additive Milestone 2 migration and metadata.
- `lib/auth/session.ts`: reusable authenticated-user helper.
- `lib/authz/authorization.ts`: centralized membership/role/resource checks.
- `lib/audit/service.ts`: safe audit event writer.
- `lib/workspaces/service.ts`, `lib/workspaces/validation.ts`: workspace operations and inputs.
- `lib/memberships/service.ts`, `lib/memberships/validation.ts`: member management and role policy.
- `lib/brands/service.ts`, `lib/brands/validation.ts`: complete role-aware brand CRUD.
- `app/api/workspaces/*`, `app/api/brands/*`: thin APIs for the new operations.
- `tests/*`: authorization, CRUD, audit, migration/schema, health, and AI regression tests.

### Task 1: Add failing role and schema contract tests

**Files:**
- Create: `tests/authorization.test.ts`, `tests/audit.test.ts`, `tests/workspace-memberships.test.ts`
- Modify: `tests/database-schema.test.ts`, `tests/brands.test.ts`, `tests/workspace-isolation.test.ts`

**Interfaces:**
- Tests define the required role policy: owner/admin brand writes, member reads only, owner-only privileged membership changes, member self-leave, and non-leaking cross-workspace denial.

- [ ] **Step 1: Write pure policy tests for OWNER/ADMIN/MEMBER decisions.**
- [ ] **Step 2: Write schema contract assertions for role values, indexes, foreign-key tables, and audit columns.**
- [ ] **Step 3: Write service-level tests for brand delete, membership operations, and audit event payloads using typed fakes.**
- [ ] **Step 4: Run `npm test -- --run tests/authorization.test.ts tests/audit.test.ts tests/workspace-memberships.test.ts tests/database-schema.test.ts tests/brands.test.ts tests/workspace-isolation.test.ts`; confirm new tests fail before implementation.**

### Task 2: Harden schema and generate an additive migration

**Files:**
- Modify: `lib/database/schema.ts`
- Create: generated `db/migrations/0001_*.sql` and metadata

**Interfaces:**
- Role values are normalized uppercase and represented by a shared `WorkspaceRole` type.
- Schema exports indexes for user membership lookup, workspace brand lookup, brand child lookup, and audit workspace/time lookup.

- [ ] **Step 1: Update the schema role default and add Drizzle check/index definitions without changing ID strategies.**
- [ ] **Step 2: Run `npm run db:generate` and inspect the generated SQL; ensure it normalizes existing lowercase roles before adding the check constraint.**
- [ ] **Step 3: Run `docker compose exec -T app npm run db:migrate` against the existing database and inspect table/index/constraint metadata with `psql`.**
- [ ] **Step 4: Run schema tests and commit the migration checkpoint.**

### Task 3: Implement centralized authorization and audit services

**Files:**
- Modify: `lib/auth/session.ts`, `lib/workspaces/service.ts`
- Create: `lib/authz/authorization.ts`, `lib/audit/service.ts`, `lib/workspaces/roles.ts`

**Interfaces:**
- `requireAuthenticatedUser(headers: Headers)` returns the Better Auth user or throws `AppError("UNAUTHENTICATED", 401, ...)`.
- `requireWorkspaceMember(userId: string, workspaceId: string, db?: Database)` returns membership or a 404.
- `requireWorkspaceRole(userId: string, workspaceId: string, roles: WorkspaceRole[], db?: Database)` returns membership or a 403/404 policy error.
- `recordAuditEvent(input: AuditEventInput, db?: Database): Promise<void>` writes safe metadata.

- [ ] **Step 1: Implement shared role constants and pure `canPerformWorkspaceAction(role, action)` policy.**
- [ ] **Step 2: Implement authorization helpers using membership queries and non-leaking resource resolution.**
- [ ] **Step 3: Implement audit event insertion with a typed allowlist of action/resource types and metadata sanitization.**
- [ ] **Step 4: Run focused authorization/audit tests and verify they pass.**

### Task 4: Complete workspace and membership services/APIs

**Files:**
- Modify: `lib/workspaces/service.ts`, `lib/workspaces/validation.ts`, `app/api/workspaces/route.ts`
- Create: `lib/memberships/service.ts`, `lib/memberships/validation.ts`, `app/api/workspaces/[id]/route.ts`, `app/api/workspaces/[id]/members/route.ts`, `app/api/workspaces/[id]/members/[userId]/route.ts`, `app/api/workspaces/[id]/leave/route.ts`
- Modify: dashboard workspace UI only as needed to expose real operations.

**Interfaces:**
- `getWorkspace(userId, workspaceId)` returns an authorized workspace.
- `updateWorkspace(userId, workspaceId, input)` requires owner/admin.
- `deleteWorkspace(userId, workspaceId)` requires owner and cascades safely.
- `listMembers(userId, workspaceId)`, `addMember(actorId, workspaceId, input)`, `changeMemberRole(actorId, workspaceId, targetUserId, role)`, `removeMember(actorId, workspaceId, targetUserId)`, `leaveWorkspace(userId, workspaceId)` enforce the role policy.

- [ ] **Step 1: Implement workspace get/update/delete service methods with audit events and membership checks.**
- [ ] **Step 2: Implement add-existing-user-by-email, role change, remove, and self-leave operations.**
- [ ] **Step 3: Add thin route handlers with Zod validation and safe error responses.**
- [ ] **Step 4: Run membership/workspace tests and verify cross-workspace mutation denial.**

### Task 5: Complete brand CRUD with role-aware authorization and audits

**Files:**
- Modify: `lib/brands/service.ts`, `app/api/brands/[id]/route.ts`, `app/api/brands/route.ts`
- Modify: `tests/brands.test.ts`, `tests/workspace-isolation.test.ts`

**Interfaces:**
- `listBrands`/`getBrand` require membership.
- `createBrand`/`updateBrand`/`deleteBrand` require OWNER or ADMIN.
- Delete returns no content and records `brand.deleted` before the row is removed.

- [ ] **Step 1: Add a failing delete route/service test and member-write denial test.**
- [ ] **Step 2: Implement role-aware create/update/delete and audit events.**
- [ ] **Step 3: Add `DELETE /api/brands/:id` and preserve existing read/update response shapes.**
- [ ] **Step 4: Run complete brand/isolation tests.**

### Task 6: Add runtime regression tests and documentation updates

**Files:**
- Create/modify: `tests/runtime-health.test.ts`, `tests/ai-regression.test.ts`
- Modify: `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `SETUP.md`

- [ ] **Step 1: Add route-level regression coverage for `/api/health`, PostgreSQL, Redis, Ollama, and generation provider contracts.**
- [ ] **Step 2: Document role policy, membership APIs, migration safety, and audit events.**
- [ ] **Step 3: Run `npm run typecheck`, `npm run lint`, `npm test -- --run`, and `npm run build`.**

### Task 7: Full Milestone 2 runtime verification

**Files:**
- Modify only verified failures.

- [ ] **Step 1: Run `docker compose config`.**
- [ ] **Step 2: Run `docker compose up -d --build` without deleting volumes.**
- [ ] **Step 3: Run `docker compose exec -T app npm run db:migrate`.**
- [ ] **Step 4: Run `docker compose ps`, health endpoints, and PostgreSQL metadata checks.**
- [ ] **Step 5: Run `./scripts/verify-local.ps1` and confirm all checks pass.**
- [ ] **Step 6: Run `git status --short --branch`; report remaining issues and explicitly stop before Milestone 3.**
