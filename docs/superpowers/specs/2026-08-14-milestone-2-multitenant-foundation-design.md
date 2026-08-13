# Flowyn Milestone 2 Multi-Tenant Foundation Design

## Scope

Milestone 2 hardens the existing Milestone 1 persistence and tenant boundary. It does not implement RAG, embeddings, documents, agents, tools, workflows, queues, scheduling, webhooks, approvals, integrations, or the content editor.

The delivered flow is:

`authenticated user -> workspace membership -> authorized workspace/brand operation -> audit event`

## Role policy

Roles are stored as uppercase values: `OWNER`, `ADMIN`, and `MEMBER`.

- `OWNER`: full workspace and brand management; can manage roles, remove members, and delete the workspace. The sole owner cannot leave without first adding another owner.
- `ADMIN`: can read the workspace, manage brands, add ordinary members, and remove ordinary members. Admins cannot change roles, remove owners/admins, or delete the workspace.
- `MEMBER`: can read workspace and brand data and leave a workspace. Members cannot create, update, or delete brands and cannot manage memberships.

The existing Milestone 1 owner-created workspace flow remains unchanged from a user perspective.

## Authorization architecture

Authorization is centralized in `lib/authz/authorization.ts` and `lib/workspaces/service.ts`:

- `requireAuthenticatedUser(headers)` derives the user from Better Auth.
- `requireWorkspaceMember(userId, workspaceId)` returns the membership or a non-leaking 404.
- `requireWorkspaceRole(userId, workspaceId, roles)` checks the membership role.
- `requireWorkspaceResource(userId, resourceId, resource)` resolves a workspace-owned resource and verifies membership before returning it.

Routes authenticate, validate with Zod, call a service, and serialize a safe response. A frontend-supplied workspace ID is never trusted by itself; it is always checked against the authenticated membership. Resource IDs outside the user’s workspace return 404.

## Services and APIs

The domain layer is split into:

- `WorkspaceService`: create/list/get/update/delete workspaces.
- `MembershipService`: list, add existing users by email, change roles, remove members, and leave.
- `BrandService`: list/create/read/update/delete brands with role checks.
- `AuditLogService`: record security-sensitive mutations with non-secret metadata.

Routes:

- `GET/POST /api/workspaces`
- `GET/PATCH/DELETE /api/workspaces/:id`
- `GET/POST /api/workspaces/:id/members`
- `PATCH/DELETE /api/workspaces/:id/members/:userId`
- `POST /api/workspaces/:id/leave`
- Existing `GET/POST /api/brands` and `GET/PATCH/DELETE /api/brands/:id`

The existing brand routes remain supported. Brand create/update/delete require owner or admin membership; brand reads/listing require any membership.

## Database integrity

The migration keeps the current UUID workspace/brand IDs and Better Auth text user IDs. It adds:

- Role check constraint allowing only `OWNER`, `ADMIN`, `MEMBER`.
- Indexes for membership lookup by user, brand lookup by workspace, child brand records by brand, and audit lookup by workspace/time.
- Explicit composite uniqueness for one membership per user/workspace.
- Existing foreign keys and cascade behavior are preserved and verified.

The migration is additive/transformative and must run against the existing local database without dropping volumes or resetting data. Existing lowercase role values are normalized before the role constraint is added.

## Audit events

Audit records are written for workspace creation/update/deletion, membership add/role-change/remove/leave, brand create/update/delete. Metadata contains safe identifiers and role/name changes only; passwords, session tokens, connection strings, and credentials are never written.

## Testing

Tests cover role authorization, workspace and membership operations, brand CRUD/delete, cross-workspace isolation, audit event calls, migration/schema contracts, existing health endpoints, and preservation of Ollama generation behavior. Runtime verification runs the migration against PostgreSQL without reset, then TypeScript, ESLint, all Vitest tests, production build, Docker Compose, and health checks.
