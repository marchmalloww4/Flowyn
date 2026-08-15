# Milestone 14 Product Experience Design

**Status:** Approved architecture translated into an implementation-ready design. This document is design-only; it does not authorize production code, dependency installation, migrations, commits, or M15 work.

**Objective:** Deliver a coherent, accessible, responsive Flowyn product experience with server-derived onboarding and end-to-end browser validation while preserving the proven M1–M13 backend and security architecture.

**Baseline:** `master` at `a5f0802`, synchronized with `origin/master`, tagged `v0.13.0`, with a clean working tree before this documentation change. The package engine requirement `Node >=22.23.1` is authoritative; the older Node 20.9+ sentence in SETUP.md is documentation drift to correct in Task 22.

## Scope and non-goals

M14 is primarily a frontend and product-quality milestone. It reorganizes the authenticated application into understandable product surfaces, improves the interaction states of existing capabilities, adds accessibility and responsive behavior, and introduces browser-level validation.

M14 does not redesign workflow execution, scheduling, webhooks, approvals, integrations, usage admission, RAG, AgentRunner, LLMProvider, database authorization, worker behavior, or production deployment. It does not add a new connector or change what an existing endpoint is allowed to do.

M14 explicitly does not add:

- persistent onboarding state or an onboarding database table;
- file uploads, OAuth, billing, marketplace features, generic HTTP, arbitrary URLs, shell/SQL/filesystem execution, dynamic code, or browser automation at runtime;
- additional Slack operations or real Slack delivery in automated tests;
- a new client-side authorization system;
- full graph-editing accessibility through keyboard-only canvas manipulation;
- M15 release-candidate, beta, load, deployment, backup/restore, rollback, or final v1.0 work.

## Current repository integration map

The current app is a single authenticated dashboard composed of independently fetching client panels. The main UI seams are:

- `app/(dashboard)/dashboard/page.tsx`: authenticated dashboard entry point and current monolithic composition;
- `components/flowyn-shell.tsx`: current shell and placeholder navigation;
- `components/forms/workspace-brand-panel.tsx`: workspace and brand selection/creation and nested operations view;
- `components/forms/knowledge-panel.tsx`: bounded manual knowledge entry and indexing;
- `components/forms/ai-generation-panel.tsx`: streamed AI generation and optional brand context;
- `components/forms/agent-panel.tsx`: agent definition management and synchronous runs;
- `components/forms/workflow-panel.tsx` and `components/forms/workflow-editor.tsx`: durable workflow management, visual editor, Advanced JSON, run/cancel behavior;
- `components/forms/schedule-panel.tsx`: schedule management and occurrence history;
- `components/forms/webhook-panel.tsx`: secure inbound webhook management and safe event history;
- `components/forms/approval-panel.tsx`: human approval inbox and decisions;
- `components/forms/integration-panel.tsx`, `components/integrations/credential-form.tsx`, and `components/integrations/credential-list.tsx`: encrypted Slack credential lifecycle;
- `components/forms/operations-panel.tsx` and `components/forms/usage-summary.tsx`: M12 usage and operations projections;
- `components/ui/button.tsx`, `input.tsx`, and `label.tsx`: current shared primitives;
- `app/globals.css`: current global Tailwind and theme styles;
- `lib/http.ts`: server serialization of safe error responses and correlation IDs;
- `lib/security/errors.ts`: `AppError`, failure categories, and safe error response mapping;
- `lib/authz/authorization.ts`: centralized workspace action and role enforcement;
- `lib/workspaces`, `lib/brands`, `lib/knowledge`, `lib/ai`, `lib/agents`, `lib/workflows`, `lib/schedules`, `lib/webhooks`, `lib/integrations`, and `lib/usage`: authoritative server services that the UI must continue to call through existing routes.

The repository has M13 architecture and exclusion documentation but no repository-authored M14 specification. The supplied M14 objective is therefore the scope authority. Existing documentation also contains stale early-milestone copy and a README statement that stops at M12; M14 documentation work should correct those references without changing runtime architecture.

## Product information architecture

The authenticated product should use these routes:

| Product surface | Route | Existing capability reused |
| --- | --- | --- |
| Overview | `/dashboard` | Workspace/brand summary, onboarding, operations summary |
| Brands | `/dashboard/brands` | `/api/workspaces`, `/api/brands` |
| Knowledge | `/dashboard/knowledge` | `/api/knowledge`, reindex route |
| AI | `/dashboard/ai` | `/api/ai/generate`, `/api/ai/health` |
| Agents | `/dashboard/agents` | `/api/agents`, agent run routes |
| Workflows | `/dashboard/workflows` | Workflow API and existing visual editor |
| Schedules | `/dashboard/schedules` | Workflow schedule APIs and occurrence history |
| Webhooks | `/dashboard/webhooks` | Secure workflow webhook APIs and event history |
| Approvals | `/dashboard/approvals` | Human approval inbox and decision APIs |
| Integrations | `/dashboard/integrations` | Catalog and encrypted credential APIs |
| Usage/Operations | `/dashboard/operations` | M12 usage and operations projections |
| Workspace/settings | `/dashboard/settings` | Workspace and membership APIs |

Knowledge owns manual documents. Operations owns execution summaries. The old Dashboard, Automations, Documents, and Executions labels should not remain as competing top-level concepts.

## Route and component architecture

Use an authenticated dashboard layout rather than mounting every panel on one page.

### Server Components

Server Components should own:

- route pages that establish the session and redirect unauthenticated users;
- page metadata and stable headings;
- the authenticated shell boundary and initial safe session display data;
- route-level loading and error boundaries;
- static explanatory content that does not need browser state.

Server Components must not accept a browser-selected workspace as proof of access. If a route reads data server-side, it must use the existing authenticated session and service authorization.

### Client Components

Client Components should own only interactive state:

- workspace selection and fetch convenience;
- form input and submit state;
- streaming AI output;
- confirmation dialogs and live regions;
- workflow canvas interaction;
- mobile navigation drawer;
- browser-local onboarding dismissal;
- browser API calls that reuse the server contracts.

Panels should be split into route containers and focused interaction components. A route should not import unrelated feature panels solely because they exist on the old dashboard.

### Layouts and boundaries

Create a dashboard layout around the authenticated shell. Each feature page should provide:

1. a stable server-rendered page heading;
2. a client boundary for the feature interaction;
3. a `loading.tsx` or equivalent skeleton for initial route loading;
4. an `error.tsx` boundary that maps unexpected route failures to a safe recovery message;
5. bounded data requests after the selected workspace is known.

The existing workflow editor should be dynamically imported from the workflow page so React Flow is not included in every dashboard route.

## Authenticated shell and navigation

`FlowynShell` becomes the shared authenticated layout with:

- `header`, `aside`, `nav`, `main`, and `footer` landmarks where present;
- a skip link targeting the main content ID;
- actual Next.js `Link` elements for every product destination;
- `aria-current="page"` on the active route;
- desktop sidebar at 1280px and above;
- a keyboard-operable mobile drawer below the desktop breakpoint;
- a workspace switcher showing only memberships returned from `/api/workspaces`;
- an account menu with Better Auth sign-out;
- a route title and short description in the main content;
- no placeholder “soon” labels for implemented M1–M13 capabilities.

The shell must not make permission decisions based only on whether a control is hidden. It may hide or disable controls for usability, but every action must still handle a server `403` safely.

## Workspace context

Introduce a browser-only selected-workspace context with an explicit presentation-only contract:

```ts
type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

type WorkspaceContextValue = {
  workspaces: WorkspaceSummary[];
  workspaceId: string | null;
  workspace: WorkspaceSummary | null;
  loading: boolean;
  error: string | null;
  selectWorkspace: (workspaceId: string) => void;
  reload: () => Promise<void>;
};
```

Rules:

- Initialization fetches `/api/workspaces` with `cache: "no-store"`.
- A URL workspace query value may be used as a deep-link convenience, but it is accepted only if it matches the server-returned membership list.
- If no valid query exists, use the first returned membership.
- Persist only the selected workspace ID, if needed, in a non-sensitive browser preference. Do not persist workspace data, credentials, prompts, secrets, or authorization decisions.
- On switching, abort requests associated with the previous workspace, clear feature-local data, and load the new workspace’s resources.
- An invalid, deleted, or no-longer-authorized workspace falls back to the first valid membership and announces the change.
- If no memberships remain, clear the selection and show the workspace-creation state.
- Mobile uses the same context through the drawer/switcher; it must not maintain a separate selection.
- The context is never passed to server code as proof of authorization.

## Server-derived onboarding

Onboarding derives state from existing authoritative resources. No onboarding table or migration is allowed.

For the selected workspace, derive:

| Stage | Complete when |
| --- | --- |
| Workspace | `/api/workspaces` returns at least one valid membership. A new account with no memberships remains at this stage. |
| Brand | `/api/brands?workspaceId=...` returns at least one brand owned by the selected workspace. |
| Knowledge | At least one returned knowledge document for a selected brand has `status === "READY"`. A failed or processing document is not complete. |
| AI / agent / workflow | At least one enabled or usable agent/workflow exists for the selected workspace. AI generation itself is available once a brand exists and is presented as a guided action, not falsely persisted as completion. |

Behavior:

- New account: workspace creation is the primary action.
- Joined workspace: skip workspace creation and begin at brand or the first incomplete stage.
- Empty workspace: show workspace creation only when there are no memberships; otherwise show brand creation.
- Partial progress: show completed stages as read-only summaries and focus the next incomplete stage.
- Completed: replace the large checklist with a compact completion state and normal overview content.
- Skip: store only a browser-local dismissal marker such as `flowyn.onboarding.dismissed.v1=true`; the marker contains no workspace ID or sensitive data.
- Resume: remove or ignore the marker when the user selects “Resume setup”; recompute all stages from the server.
- Workspace switching: recompute the checklist for the newly selected workspace; never carry completion between workspaces.

## Feature UX contracts

### Brands

Use the existing workspace and brand APIs. Show selected workspace, brand list, create/edit forms, and empty states. The UI should expose role-aware actions based on the existing action map while still handling authorization errors. Brand records remain workspace-scoped and never come from another workspace’s response.

### Knowledge

Retain manual bounded text input. Show document title, source name, indexing status, safe failure code presentation, character guidance, re-index action, and delete confirmation. Do not add uploads or arbitrary URLs. A `READY` status is the only onboarding completion state.

### AI generation

Retain the `LLMProvider`-backed streaming route. Add prompt length guidance, selected brand context, stream start/complete/error announcements, cancel behavior, and safe output rendering. Abort a stream when the user leaves the page. Do not display provider URLs, model internals, or raw response payloads.

### Agents

Reuse the existing controlled AgentRunner and safe tool catalog. Separate definition management from run execution and bounded run history. Members may run according to the existing action map; management controls are for authorized roles. Deletion requires confirmation and remains the existing soft-delete behavior.

### Workflows and editor

Reuse the existing workflow registry, route validation, immutable versions, outbox/worker execution, and version conflict behavior. The page should separate workflow list, create/edit metadata, run controls, and visual editor.

The canvas remains a visual enhancement, not the only editing surface. Add an accessible step/list view that exposes:

- ordered steps and registered types;
- step names and safe configuration summaries;
- reachable approval and integration-policy information;
- a link or control to Advanced JSON mode;
- validation and version-conflict messages.

On mobile, default to the accessible list/JSON mode and provide read-only canvas inspection only when it fits the viewport. Do not add arbitrary graph execution or new step types.

### Schedules

Reuse PostgreSQL-authoritative schedule state and existing schedule APIs. Show schedule type, timezone, next run, enabled/disabled state, bounded occurrence history, and misfire-safe status. Confirm disable and delete actions.

### Webhooks

Reuse the secure management APIs and existing HMAC/replay/deduplication behavior. Show endpoint metadata, enabled state, secret version, and safe delivery history. Display a secret only in the existing one-time create/rotate response, provide copy feedback, and never persist it in browser storage. Confirm rotate, disable, and delete actions.

### Approvals

Build a dedicated inbox using existing approval projections. Show pending, approved, rejected, expired, and cancelled states; required role; bounded review context; workflow/run links; and timestamps. Only currently authorized human users see decision controls. Approval decisions remain server-authoritative and idempotent.

### Integrations

Reuse the catalog and encrypted credential APIs. Display Slack only, with `post_message` described as the only operation. Credential creation and rotation use password-like inputs and clear them after submission. List only safe metadata. Revoke and rotate require accessible confirmation or replacement-token dialogs. Fake E2E tokens are never sent to Slack.

### Usage/Operations

Promote the current operations panel to `/dashboard/operations`. Show plan, bounded counters, limits, active concurrency, rate-limit degradation, workflow/agent/integration statuses, and deferred dispatch counts. Use safe projections only; do not add detailed payload inspection.

### Workspace/settings

Reuse workspace CRUD, membership listing, role changes, removal, leave, and existing role constraints. Expose OWNER/ADMIN/MEMBER capabilities accurately. Keep last-owner protections and server-side membership checks unchanged.

## Shared design system

Reuse Tailwind v4, CVA, `lucide-react`, `@radix-ui/react-slot`, and the existing `Button`, `Input`, and `Label` primitives. Do not introduce another UI framework.

The shared component contracts are:

```ts
type PageHeaderProps = { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode };
type SectionHeaderProps = { title: string; description?: string; action?: React.ReactNode };
type StatusBadgeProps = { tone: "neutral" | "success" | "warning" | "danger" | "info"; children: React.ReactNode };
type EmptyStateProps = { title: string; description: string; action?: React.ReactNode };
type SkeletonProps = { label: string; className?: string };
type InlineAlertProps = { tone: "error" | "warning" | "info" | "success"; title?: string; children: React.ReactNode };
type FormFieldProps = { label: string; htmlFor: string; description?: string; error?: string; required?: boolean; children: React.ReactNode };
type FieldErrorProps = { id: string; children: React.ReactNode };
type ConfirmDialogProps = { open: boolean; title: string; description: string; confirmLabel: string; destructive?: boolean; pending?: boolean; onCancel: () => void; onConfirm: () => void };
type LiveRegionProps = { mode: "polite" | "assertive"; children: React.ReactNode };
type ProgressProps = { label: string; value: number; max: number };
type ResponsiveListProps<T> = { items: T[]; getKey: (item: T) => string; renderItem: (item: T) => React.ReactNode; empty: React.ReactNode };
type WorkspaceSwitcherProps = { workspaces: WorkspaceSummary[]; value: string | null; onChange: (workspaceId: string) => void };
```

Each control must support visible focus, disabled/pending state, accessible names, and dark/light contrast. Status badges must not rely on color alone.

## Loading, empty, success, degraded, and destructive states

- Loading: show route skeletons and preserve the page heading; do not replace the entire shell with plain text.
- Empty: explain what the surface does and provide one safe next action.
- Success: announce a concise result in a polite live region and retain the updated server state.
- Error: show mapped safe copy, field errors, retry where safe, and correlation information only when useful.
- Degraded: distinguish unavailable Ollama, Redis-backed rate limiting, queued/deferred workflow state, and missing provider model without exposing diagnostics.
- Destructive actions: use `ConfirmDialog`, restore focus after close, disable duplicate submission, and refresh from the server after success.
- Timestamps: use semantic `<time dateTime>` with localized visible text and a stable accessible label.

## Browser API and error mapping

Create one browser helper with the following conceptual contract:

```ts
type ApiErrorBody = { error?: { code?: string; message?: string; fields?: Record<string, string[]> } };
type ClientError = { code: string; message: string; fields: Record<string, string[]>; correlationId: string | null; retryable: boolean };

async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit & { signal?: AbortSignal }): Promise<T>;
function mapApiError(response: Response, body: ApiErrorBody | null): ClientError;
```

Map at least these categories:

| Server condition | UI behavior |
| --- | --- |
| `VALIDATION_ERROR`, `INVALID_REQUEST`, `WORKFLOW_INVALID_DEFINITION` | Show field or form errors; preserve entered values. |
| `UNAUTHENTICATED` or a Better Auth session failure | Announce session expiry and route to sign-in while preserving only a non-sensitive return path. |
| `WORKSPACE_FORBIDDEN`, `WORKSPACE_NOT_FOUND`, `RESOURCE_NOT_FOUND` | Clear stale workspace/resource state and show safe access/not-found copy. |
| `WORKFLOW_VERSION_CONFLICT` | Preserve unsaved JSON/text, offer reload latest, and require an explicit user choice before overwriting. |
| `WORKSPACE_QUOTA_EXCEEDED`, `WORKSPACE_RATE_LIMIT_EXCEEDED` | Explain the workspace limit and do not automatically retry. |
| `WORKSPACE_CONCURRENCY_LIMIT`, `WORKSPACE_CONCURRENCY_UNAVAILABLE` | Show busy/degraded state; retry only through an explicit safe action. |
| `AI_PROVIDER_UNSUPPORTED`, `EMBEDDING_DIMENSION_MISMATCH`, model/provider unavailable codes | Show provider-unavailable guidance without provider internals. |
| `WEBHOOK_*` failure codes | Show safe webhook configuration or delivery status; never expose secrets or raw bodies. |
| workflow terminal failure | Show run status and safe error code/message, not queue or worker internals. |
| `INTEGRATION_*_AMBIGUOUS` or any AMBIGUOUS outcome | Clearly mark the action as ambiguous/terminal and never offer automatic retry. |
| unknown 5xx or network failure | Show generic recovery copy and correlation ID when available. |
| `AbortError` | Treat as intentional cancellation; do not show a failure alert. |

Unknown response shapes, stack traces, SQL messages, provider payloads, credentials, secrets, and unsafe external content are never rendered.

## Accessibility requirements

M14 targets WCAG 2.2 AA-oriented behavior:

- one logical `h1` per route and no skipped heading levels in feature content;
- landmarks have accessible names where multiple instances exist;
- skip link is keyboard-visible and moves focus to `main`;
- every form control has a visible label or an explicit accessible name;
- descriptions and errors use `aria-describedby`; invalid controls use `aria-invalid`;
- focus is visible in both themes and is not removed by custom styles;
- dialogs trap focus while open, close on Escape, restore focus, and expose an accessible name/description;
- menus and mobile navigation are keyboard-operable and expose expanded state;
- icon-only actions have labels and tooltips are supplementary, not the only name;
- status and progress updates use polite/assertive live regions without repeating streaming output excessively;
- destructive actions are understandable without color alone;
- contrast is checked for text, controls, focus indicators, and status tones;
- `prefers-reduced-motion` disables non-essential transitions;
- timestamps use `<time>` and readable localized text;
- workflow canvas controls have labels, and the accessible step/list/JSON alternative provides equivalent safe information and editing access;
- axe scans run against representative authenticated pages, supplemented by keyboard-only journeys.

## Responsive requirements

At 375px:

- use a mobile drawer rather than a persistent sidebar;
- stack form fields and action bars;
- keep primary actions visible and put secondary actions in a labeled overflow or stacked group;
- render lists as cards or bounded horizontal regions rather than requiring wide tables;
- wrap or copy long webhook endpoints safely;
- clamp long AI output and workflow history with an explicit expand control;
- default the workflow editor to list/JSON fallback.

At 768px:

- use a collapsible navigation region;
- use two-column layouts only where controls remain readable;
- keep dialogs within the viewport and make long content scroll inside the dialog;
- retain accessible list alternatives for workflow and history views.

At 1280px:

- show persistent navigation;
- use bounded multi-column cards;
- keep editor, operation summaries, and action bars within a readable max width;
- avoid loading unrelated panels into the overview route.

## Performance and code splitting

M14 improvements are measurable and bounded:

- each feature route loads only its own interaction components;
- `@xyflow/react` is dynamically imported on the workflow route;
- overview does not fetch knowledge, agents, schedules, webhooks, approvals, integrations, and AI panels simultaneously;
- histories remain bounded by existing API limits;
- stale workspace requests are cancelled with `AbortController`;
- feature containers avoid state updates after unmount and unnecessary rerenders;
- AI streaming state is isolated to the AI route;
- loading boundaries prevent a slow provider or history request from blocking navigation;
- the browser E2E suite records route timing only as diagnostic evidence, not as a replacement for M15 load testing.

## E2E architecture

Use a direct development dependency on `@playwright/test` pinned to the reviewed current stable `1.61.1` candidate and `@axe-core/playwright` pinned to the reviewed `4.12.1` candidate. Playwright documentation lists current Node 22 support; the package candidates are compatible with the repository’s Node `22.23.1`, Next `16.3.1`, and React 19 setup. The versions must be rechecked during implementation before installation because dependency state is time-sensitive.

The repository currently has `axe-core` transitively through lint tooling but has neither a direct Playwright contract nor a browser configuration. Do not rely on a transitive package.

Add a `playwright.config.ts` with:

- a single Chromium project for the required default suite;
- an optional Firefox/WebKit project disabled by default and reserved for M15;
- `baseURL` from a test environment variable;
- a web server command that starts the app against an isolated test database;
- `trace: "on-first-retry"`, screenshot on failure, and retained video only when a test fails;
- deterministic timeouts and no arbitrary sleeps;
- a serial setup project for user/database fixtures, with isolated browser contexts for tests.

Test data must be unique per run and created through existing APIs or a test-only seed helper. The fixture must never use real Slack credentials. A fake token such as a generated test string may be submitted through the credential form, but egress remains disabled and no integration action is executed.

The test database must be temporary or separately named, migrated with the existing Drizzle migration runner, and torn down only inside the test environment. The existing development database and Docker volumes are never reset.

CI should run static tests and the browser suite against a clean PostgreSQL/Redis/Ollama service set. AI/RAG browser cases use the existing local Ollama prerequisite or a controlled test stub at the service boundary; they must not introduce a new external provider. Real Slack tests remain opt-in and are not part of M14.

## Critical browser journeys

The browser suite must cover:

1. sign-up, sign-in, session failure handling, and sign-out;
2. workspace creation, access, switching, and empty-state recovery;
3. brand creation and editing;
4. knowledge creation, indexing state, re-index, and safe failure display;
5. AI generation with selected brand context and stream completion/error;
6. agent creation and run with bounded history;
7. visual workflow creation/editing and save feedback;
8. Advanced JSON workflow round-trip and version-conflict recovery;
9. workflow execution, queued/running/terminal status, and cancellation;
10. schedule creation, enable/disable, and occurrence status;
11. webhook creation, one-time secret copy state, rotation, and safe history;
12. approval inbox visibility and authorized decision behavior;
13. fake Slack credential create, rotate, and revoke without egress;
14. usage and operations projections;
15. workspace settings, membership roles, last-owner protections, and member limitations;
16. cross-workspace isolation through both UI context switching and direct request attempts;
17. mobile navigation at 375px;
18. mobile workflow list/JSON fallback;
19. keyboard-only navigation through sign-in, workspace selection, a representative form, dialog, and approval action;
20. representative axe scans for sign-in, overview, knowledge, workflow fallback, integration, and mobile navigation.

## Security invariants

M14 preserves:

- Better Auth authentication;
- centralized `requireWorkspaceMember` and `requireWorkspaceAction` authorization;
- server-side resource ownership checks;
- encrypted credential storage and safe credential projections;
- webhook HMAC, timestamp, replay, and deduplication protections;
- human-only approval decisions and existing role policy;
- static workflow step registry and server graph validation;
- static AgentRunner tool registry;
- Slack `post_message` as the only outbound connector operation;
- `INTEGRATION_EGRESS_ENABLED=false` by default;
- terminal AMBIGUOUS integration semantics with no automatic retry;
- no generic HTTP, arbitrary URL, shell, SQL, filesystem, dynamic code, or runtime browser automation capability;
- no credential, secret, raw webhook body, provider payload, prompt, or queue payload exposure.

Playwright is test tooling only. It must not be exposed through an application route, agent tool, workflow step, worker command, or production runtime.

## Database and migration policy

M14 requires no database migration. Onboarding state is derived from existing workspace, brand, knowledge, agent, and workflow APIs. No new table, column, index, or durable UI preference is required.

If implementation discovers a genuine schema requirement, work must stop at that seam and return for a separate architecture decision. No migration may be created under this design.

## M1–M13 compatibility

- M1–M3 authentication, workspace, brand, AI, embeddings, RAG, and health contracts remain unchanged.
- M4 security/error/audit contracts remain unchanged.
- M5 AgentRunner remains the only controlled agent runtime.
- M6 workflow execution remains PostgreSQL/outbox/BullMQ/worker authoritative.
- M7 scheduler remains PostgreSQL-authoritative.
- M8 public webhook ingress remains narrowly scoped and signed.
- M9 approvals remain human-only and generation-aware.
- M10 visual editing continues to use server validation and optimistic version tokens.
- M11 credentials remain encrypted, Slack-only, approval-gated, and egress-disabled by default.
- M12 usage admission, rate limiting, concurrency, retention, readiness, and operations projections remain server-authoritative.
- M13 production configuration, image, deployment, migration, and release boundaries remain untouched.

## Explicit M14 acceptance criteria

M14 is complete when:

1. all approved routes exist and are reachable from accessible authenticated navigation;
2. onboarding derives progress from server resources and never stores durable onboarding state;
3. each surface has consistent loading, empty, error, success, and degraded states;
4. all forms expose labels, descriptions, field errors, pending state, and keyboard operation;
5. destructive actions use accessible confirmation dialogs;
6. desktop, tablet, and mobile layouts meet the 375px, 768px, and 1280px requirements;
7. the workflow editor has a usable non-canvas alternative;
8. the browser API mapper handles the specified validation, session, authorization, conflict, quota, concurrency, provider, webhook, workflow, integration, network, cancellation, and unknown-error cases safely;
9. no UI or test change weakens workspace isolation or secret handling;
10. Playwright and axe coverage proves the critical journeys and representative accessibility behavior;
11. existing typecheck, lint, unit tests, build, Docker, and local verification pass;
12. no migration, production dependency upgrade unrelated to browser testing, backend redesign, M15 work, commit, or push is included.

## Explicit M15 boundary

M15 remains release candidate and beta validation. It owns release sign-off, production deployment validation, full load/concurrency testing, the complete browser compatibility matrix, rollback rehearsal, backup/restore rehearsal, real Slack delivery, final security release review, and the v1.0 decision. M14 may add browser tests that make M15 easier, but must not perform or claim those release activities.

## Open decisions for implementation approval

The following defaults are recommended and do not block M14:

- use URL workspace selection only as a validated display convenience, with a browser-local fallback preference;
- keep onboarding skip local and non-authoritative;
- start Playwright with Chromium only and reserve cross-browser projects for M15;
- add no Testing Library packages initially; use Vitest/jsdom for pure UI helpers and Playwright for rendered browser behavior;
- use native/hand-rolled focused primitives rather than adding a second UI framework or a broad component library;
- use a temporary test database and existing migration runner without touching the development volume.

If any of these defaults changes the product scope or requires a schema/API change, return to an architecture gate before implementation.
