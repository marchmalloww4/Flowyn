# Milestone 14 Product Experience Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reorganize Flowyn into an accessible, responsive, route-based product experience with server-derived onboarding and complete local browser validation while preserving M1–M13 behavior.

**Architecture:** Keep the Next.js App Router, Better Auth, existing API routes, server authorization, and existing feature panels. Add route-level server pages, a browser-only presentation context for workspace selection, shared UI/error primitives, and a Playwright test harness. No production service, workflow, queue, scheduler, integration, AI, agent, authorization, schema, or migration redesign is included.

**Tech Stack:** Next.js 16.3.1, React 19, TypeScript, Tailwind CSS v4, CVA, lucide-react, native semantic controls, Vitest/jsdom, @playwright/test 1.61.1 candidate, and @axe-core/playwright 4.12.1 candidate.

**Spec:** docs/superpowers/specs/2026-08-15-milestone-14-product-experience-design.md

## Global Constraints

- Keep Better Auth and getSessionUser as the authentication authority.
- Treat package.json engines.node >=22.23.1 as the authoritative Node runtime floor and correct the stale Node 20.9+ setup text in Task 22.
- Keep requireWorkspaceMember, requireWorkspaceAction, and server resource ownership checks authoritative.
- Keep PostgreSQL, Redis/BullMQ, the scheduler, outbox, LLMProvider, BrandContext/RAG, AgentRunner, workflow registry, webhook security, approval enforcement, and Slack-only egress unchanged.
- Keep INTEGRATION_EGRESS_ENABLED=false by default.
- M14 requires no database migration; onboarding state is derived from existing resources.
- Never expose credentials, webhook secrets, raw webhook bodies, provider payloads, stack traces, SQL errors, or unsafe external payloads.
- Do not add generic HTTP, arbitrary URLs, shell, SQL, filesystem, dynamic code, browser automation runtime, file uploads, OAuth, billing, or another connector.
- Do not create database migrations. If an actual schema requirement is discovered, stop that task and return to architecture review.
- Do not reset PostgreSQL, Redis, Ollama, development data, or Docker volumes.
- Do not start M15 release, beta, load, deployment, rollback, backup/restore, real Slack, or v1.0 work.
- Run tests first for every task and keep each task independently reviewable.

## File map before implementation

The implementation should add focused frontend files rather than make every feature a client component.

New shared client files:

- Create lib/client/api.ts for typed browser requests and safe error mapping.
- Create lib/client/workspace-state.ts for pure workspace selection and invalid-selection rules.
- Create lib/client/onboarding-state.ts for pure server-snapshot-to-checklist derivation.
- Create components/ui/card.tsx.
- Create components/ui/status-badge.tsx.
- Create components/ui/empty-state.tsx.
- Create components/ui/skeleton.tsx.
- Create components/ui/inline-alert.tsx.
- Create components/ui/form-field.tsx.
- Create components/ui/confirm-dialog.tsx.
- Create components/ui/live-region.tsx.
- Create components/ui/progress.tsx.
- Create components/ui/responsive-list.tsx.
- Create components/workspace/workspace-provider.tsx.
- Create components/workspace/workspace-switcher.tsx.
- Create components/onboarding/onboarding-checklist.tsx.

New route files:

- Create app/(dashboard)/dashboard/layout.tsx.
- Create app/(dashboard)/dashboard/loading.tsx.
- Create app/(dashboard)/dashboard/error.tsx.
- Create app/(dashboard)/dashboard/brands/page.tsx.
- Create app/(dashboard)/dashboard/knowledge/page.tsx.
- Create app/(dashboard)/dashboard/ai/page.tsx.
- Create app/(dashboard)/dashboard/agents/page.tsx.
- Create app/(dashboard)/dashboard/workflows/page.tsx.
- Create app/(dashboard)/dashboard/schedules/page.tsx.
- Create app/(dashboard)/dashboard/webhooks/page.tsx.
- Create app/(dashboard)/dashboard/approvals/page.tsx.
- Create app/(dashboard)/dashboard/integrations/page.tsx.
- Create app/(dashboard)/dashboard/operations/page.tsx.
- Create app/(dashboard)/dashboard/settings/page.tsx.

Browser-test files:

- Create playwright.config.ts.
- Create tests/e2e/fixtures.ts.
- Create tests/e2e/health.spec.ts.
- Create tests/e2e/auth.spec.ts.
- Create tests/e2e/workspace-brand.spec.ts.
- Create tests/e2e/knowledge-ai.spec.ts.
- Create tests/e2e/agents-workflows.spec.ts.
- Create tests/e2e/schedules-webhooks.spec.ts.
- Create tests/e2e/approvals-integrations.spec.ts.
- Create tests/e2e/operations-settings.spec.ts.
- Create tests/e2e/isolation.spec.ts.
- Create tests/e2e/responsive-accessibility.spec.ts.

## Task tracking

- [ ] Task 1: Browser and accessibility test harness.
- [ ] Task 2: Typed browser API and safe error layer.
- [ ] Task 3: Shared accessible UI primitives.
- [ ] Task 4: Authenticated shell and route navigation.
- [ ] Task 5: Workspace context and switcher.
- [ ] Task 6: Onboarding and overview.
- [ ] Task 7: Brands surface.
- [ ] Task 8: Knowledge surface.
- [ ] Task 9: AI generation surface.
- [ ] Task 10: Agents surface.
- [ ] Task 11: Workflows and accessible editor fallback.
- [ ] Task 12: Schedules surface.
- [ ] Task 13: Webhooks surface.
- [ ] Task 14: Approval inbox.
- [ ] Task 15: Integration credential experience.
- [ ] Task 16: Usage and operations surface.
- [ ] Task 17: Workspace settings and membership.
- [ ] Task 18: Accessibility hardening.
- [ ] Task 19: Responsive hardening.
- [ ] Task 20: Performance and code-splitting hardening.
- [ ] Task 21: Full browser journeys and regression verification.
- [ ] Task 22: Documentation and final traceability.

## Task 1: Browser and accessibility test harness

**Objective:** Add an isolated Playwright/axe harness without changing production runtime behavior.

**Expected files:**

- Create playwright.config.ts.
- Create tests/e2e/fixtures.ts.
- Create tests/e2e/health.spec.ts.
- Modify package.json.
- Modify package-lock.json only through the approved package manager install.

**Tests written first:**

- health.spec.ts starts at the configured base URL and asserts the Flowyn landing heading is visible.
- The fixture creates a unique email per run, signs up through the UI, and asserts a redirect to /dashboard.
- Configuration discovery lists the Chromium project and confirms failure artifacts use trace-on-first-retry and screenshots on failure.

**Implementation work:**

- Add the test:e2e script.
- Add direct development dependencies pinned after final review to @playwright/test 1.61.1 and @axe-core/playwright 4.12.1.
- Configure Chromium only for M14, baseURL from E2E_BASE_URL, deterministic timeouts, trace on first retry, and screenshot/video retention on failure.
- Require E2E_DATABASE_URL to point to a separately named temporary database. Never point the fixture at the normal development database.
- Use existing Drizzle migrations before the suite and a test-only cleanup routine that deletes only records carrying the unique run prefix.

**Accessibility considerations:** The first browser test uses role/name locators and fails if the landing heading or primary links lack accessible names.

**Responsive considerations:** The base configuration supports per-test viewport overrides; mobile projects are added in the responsive task.

**Security considerations:** Playwright is test-only. Fake integration tokens are generated per run, egress is disabled, and tests do not log request bodies or secrets.

**M1–M13 regression risk:** Package changes are limited to direct test tooling and the test script. Do not change runtime dependencies, Docker images, migrations, or application API behavior.

**Database/migration:** No migration. The test database runs existing migrations only.

**Verification:** Run npm exec playwright test -- --list, npm run typecheck, and npm run lint. Expected result: the test list resolves, static checks remain green, and no production route changes exist.

**Commit boundary recommendation:** test: add isolated browser validation harness.

## Task 2: Typed browser API and safe error layer

**Objective:** Replace repeated ad-hoc response parsing with one safe client abstraction.

**Expected files:**

- Create lib/client/api.ts.
- Create tests/client-api.test.ts.
- Modify components/forms/auth-form.tsx.
- Modify each panel as it is migrated in later tasks.

**Interfaces:**

- ClientError contains code, message, fields, correlationId, and retryable.
- FlowynClientError extends Error and stores ClientError details.
- apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T>.
- mapApiError(response: Response, body: unknown): ClientError.

**Tests written first:**

- A VALIDATION_ERROR response preserves field errors and maps to a form-safe message.
- WORKSPACE_FORBIDDEN, WORKSPACE_NOT_FOUND, and RESOURCE_NOT_FOUND map to non-disclosing access/not-found copy.
- WORKFLOW_VERSION_CONFLICT maps to non-retryable conflict with unsaved-edit guidance.
- Quota and concurrency codes are not automatically retried.
- Provider/Ollama failures map to safe availability copy.
- Any code containing AMBIGUOUS maps to terminal, non-retryable state.
- An unknown 500 omits the server message and retains only the correlation ID.
- AbortError is returned as cancellation rather than a visible failure.

**Implementation work:**

- Parse the existing { error: { code, message, fields } } shape and x-flowyn-correlation-id.
- Use an allowlist of user-facing messages for internal, provider, and unknown failures.
- Mark only explicitly safe transient reads as retryable; never retry mutation, quota, conflict, integration, webhook, or ambiguous operations automatically.
- Handle Better Auth’s existing response shape without exposing raw details.
- Preserve field errors and request cancellation.

**Accessibility considerations:** The helper exposes field errors for aria-describedby and aria-invalid and does not require visual-only error rendering.

**Responsive considerations:** Error components wrap safely at 375px and do not force horizontal scrolling.

**Security considerations:** Never place response bodies, credentials, webhook secrets, or provider payloads in thrown error messages or console logs.

**M1–M13 regression risk:** Existing route contracts remain unchanged. Tests cover current Better Auth, AI, workflow, webhook, integration, and operations error shapes.

**Database/migration:** None.

**Verification:** Run npm test -- --run tests/client-api.test.ts, npm run typecheck, and npm run lint. Expected result: all mappings pass and no raw internal response is exposed.

**Commit boundary recommendation:** feat: add safe browser API error handling.

## Task 3: Shared accessible UI primitives

**Objective:** Establish consistent presentational primitives before migrating feature panels.

**Expected files:**

- Create components/ui/card.tsx.
- Create components/ui/status-badge.tsx.
- Create components/ui/empty-state.tsx.
- Create components/ui/skeleton.tsx.
- Create components/ui/inline-alert.tsx.
- Create components/ui/form-field.tsx.
- Create components/ui/confirm-dialog.tsx.
- Create components/ui/live-region.tsx.
- Create components/ui/progress.tsx.
- Create components/ui/responsive-list.tsx.
- Create tests/ui-primitives-contract.test.ts.
- Modify app/globals.css.

**Tests written first:**

- The contract test checks that every primitive exports its named component.
- The dialog contract checks accessible title/description, open, pending, cancel, confirm, and destructive semantics.
- FormField contract checks that generated description and error IDs can be attached to a child control.
- LiveRegion contract checks polite and assertive modes.
- Browser tests later verify focus trapping and restoration.

**Implementation work:**

- Use Tailwind/CVA and current Button, Input, and Label primitives; do not add a UI framework.
- Implement a native dialog or controlled focus-managed dialog with Escape handling, initial focus, focus restoration, and pending confirmation state.
- Add semantic status/alert, skeleton, progress, and responsive-list markup.
- Add CSS for visible focus, reduced motion, screen-reader-only content, and invalid/focus states.

**Accessibility considerations:** Every primitive exposes a semantic element, accessible name, and focus state. Status color is paired with text.

**Responsive considerations:** Cards, alerts, dialogs, and list rows fit 375px without clipped actions.

**Security considerations:** Primitives render escaped React children and do not accept HTML strings or unsafe markup.

**M1–M13 regression risk:** Preserve existing button variants, input behavior, dark mode, and form semantics while adding classes.

**Database/migration:** None.

**Verification:** Run npm test -- --run tests/ui-primitives-contract.test.ts, npm run typecheck, and npm run lint. Expected result: primitives compile and existing styling contracts remain usable.

**Commit boundary recommendation:** feat: add accessible UI primitives.

## Task 4: Authenticated shell and route navigation

**Objective:** Turn the placeholder shell into the route-aware authenticated application frame.

**Expected files:**

- Create app/(dashboard)/dashboard/layout.tsx.
- Create app/(dashboard)/dashboard/loading.tsx.
- Create app/(dashboard)/dashboard/error.tsx.
- Create tests/shell-navigation-contract.test.ts.
- Modify components/flowyn-shell.tsx.
- Modify app/globals.css.
- Modify app/(dashboard)/dashboard/page.tsx.

**Tests written first:**

- The route contract lists exactly the twelve approved product routes.
- Active navigation exposes aria-current=page for the current route.
- The skip link targets the main content ID.
- The mobile menu exposes expanded state, closes on Escape, and returns focus to its trigger.
- Unauthenticated dashboard access still redirects to /sign-in.

**Implementation work:**

- Move shared shell responsibility into the dashboard layout.
- Replace non-link placeholder items with Next.js links.
- Add accessible mobile drawer and account/sign-out control through Better Auth’s existing endpoint.
- Render the current user email as safe display data only.
- Add route-level loading and error boundaries.
- Remove stale M11/M1 copy from the overview heading.

**Accessibility considerations:** Add landmarks, skip link, route focus behavior, active-link semantics, keyboard drawer controls, and labels for icon-only actions.

**Responsive considerations:** Persistent sidebar at 1280px; drawer at 375px and 768px; no fixed desktop-only content.

**Security considerations:** Navigation visibility is not authorization. Every action continues through protected routes and handles 403.

**M1–M13 regression risk:** Keep the dashboard authentication redirect and all existing panels available through their new route containers.

**Database/migration:** None.

**Verification:** Run npm test -- --run tests/shell-navigation-contract.test.ts, npm run typecheck, npm run lint, and npm run build. Expected result: the app builds with real navigation and no backend changes.

**Commit boundary recommendation:** feat: add accessible authenticated navigation.

## Task 5: Workspace context and switcher

**Objective:** Centralize selected-workspace presentation state while preserving server authorization.

**Expected files:**

- Create lib/client/workspace-state.ts.
- Create components/workspace/workspace-provider.tsx.
- Create components/workspace/workspace-switcher.tsx.
- Create tests/workspace-context.test.ts.
- Modify components/flowyn-shell.tsx.
- Modify app/(dashboard)/dashboard/layout.tsx.
- Modify feature containers as they migrate.

**Tests written first:**

- A valid URL or stored workspace ID selects a returned membership.
- An invalid ID falls back to the first returned membership.
- Empty membership results produce a null selection.
- Switching clears feature state and aborts the previous request.
- A deleted/lost-membership workspace is removed from selection without preserving stale data.
- Switching workspaces never reuses the prior workspace’s brands, documents, runs, credentials, or operations.

**Implementation work:**

- Fetch /api/workspaces with cache: no-store.
- Validate URL/local selection against returned memberships.
- Store only the selected ID if persistence is enabled.
- Provide an AbortController signal or generation token for feature fetches.
- Clear client caches/state before loading the next workspace.

**Accessibility considerations:** The switcher has a visible label, selected state, keyboard operation, and a live-region announcement after switching.

**Responsive considerations:** Reuse the provider in desktop shell and mobile drawer; keep the control full-width on narrow screens.

**Security considerations:** The selected ID is convenience state only. APIs continue to validate membership and resource ownership.

**M1–M13 regression risk:** Existing panels initialize their own workspace; migrate them incrementally and keep API request shapes unchanged during transition.

**Database/migration:** None.

**Verification:** Run npm test -- --run tests/workspace-context.test.ts, npm run typecheck, and npm run lint. Expected result: selection is consistent across routes with no authorization logic in the provider.

**Commit boundary recommendation:** feat: add workspace-aware product context.

## Task 6: Onboarding and overview

**Objective:** Replace the monolithic overview with server-derived onboarding and safe summary cards.

**Expected files:**

- Create lib/client/onboarding-state.ts.
- Create components/onboarding/onboarding-checklist.tsx.
- Create components/dashboard/overview-page.tsx.
- Create tests/onboarding-state.test.ts.
- Modify app/(dashboard)/dashboard/page.tsx.
- Modify components/forms/workspace-brand-panel.tsx.
- Modify components/forms/operations-panel.tsx.

**Tests written first:**

- Snapshot derivation covers no membership, workspace-only, brand-only, processing knowledge, READY knowledge, agent/workflow completion, and completed state.
- Local skip affects visibility only and never changes derived completion.
- Switching workspace recomputes all stages.
- Overview renders a safe empty state for a new account and does not request every feature endpoint.

**Implementation work:**

- Fetch existing workspaces, brands, knowledge, agents, and workflows for the selected workspace.
- Derive membership, brand, READY knowledge, and enabled/usable agent/workflow stages exactly as specified.
- Add a local dismissal marker without workspace data.
- Promote operations summary to a compact overview card while retaining a dedicated route later.
- Remove stale milestone copy.

**Accessibility considerations:** Checklist stages expose completed/current/upcoming text, not color-only indicators; primary action receives focus when appropriate.

**Responsive considerations:** Stack checklist and summary cards at 375px; keep the next action visible without horizontal scrolling.

**Security considerations:** Completion is never accepted from local state; every resource request remains workspace-authorized.

**M1–M13 regression risk:** Do not change workspace, brand, or operations APIs or role behavior.

**Database/migration:** None.

**Verification:** Run npm test -- --run tests/onboarding-state.test.ts, npm run typecheck, and npm run lint. Expected result: new and partially configured workspaces receive deterministic guidance without new persistence.

**Commit boundary recommendation:** feat: add server-derived onboarding overview.

## Task 7: Brands surface

**Objective:** Provide a focused Brands route using existing workspace and brand forms.

**Expected files:**

- Create app/(dashboard)/dashboard/brands/page.tsx.
- Create components/dashboard/brands-page.tsx.
- Create tests/brands-ui-contract.test.ts.
- Modify components/forms/workspace-brand-panel.tsx.

**Tests written first:**

- Workspace and brand lists render safe empty states.
- Selected workspace changes the brand request and clears prior brands.
- Create/edit controls follow server role responses.
- Cross-workspace resource IDs do not render as local brands.

**Implementation work:**

- Split workspace management and brand management into route-focused sections.
- Add selected-button semantics and mutation confirmation where existing routes support it.
- Reuse existing Zod-backed API routes without creating a conflicting frontend-only contract.

**Accessibility considerations:** Workspace choices expose selected state; forms use FormField, descriptions, field errors, and live success status.

**Responsive considerations:** Use one-column forms at 375px and two columns only when labels/actions remain readable.

**Security considerations:** Never infer role from a hidden control; handle server WORKSPACE_FORBIDDEN safely.

**M1–M13 regression risk:** Preserve brand/workspace payloads and audit behavior.

**Database/migration:** None.

**Verification:** Run npm test -- --run tests/brands.test.ts tests/brands-ui-contract.test.ts, npm run typecheck, and npm run lint. Expected result: Brands is independently navigable with unchanged server behavior.

**Commit boundary recommendation:** feat: add focused brands experience.

## Task 8: Knowledge surface

**Objective:** Refactor knowledge management into an accessible, status-oriented route.

**Expected files:**

- Create app/(dashboard)/dashboard/knowledge/page.tsx.
- Create components/dashboard/knowledge-page.tsx.
- Create tests/knowledge-ui-state.test.ts.
- Modify components/forms/knowledge-panel.tsx.

**Tests written first:**

- READY, PENDING, PROCESSING, and FAILED render distinct text statuses.
- Empty brand knowledge renders a creation action.
- Delete uses confirmation and refreshes server state.
- Re-index failure maps through apiRequest without exposing provider internals.
- A changed workspace clears documents before loading new ones.

**Implementation work:**

- Use /api/knowledge, /api/knowledge/:id, and /api/knowledge/:id/reindex unchanged.
- Add character guidance, bounded source metadata, safe status badge, skeleton, and empty state.
- Preserve manual text-only knowledge; do not add files or external URLs.

**Accessibility considerations:** Textarea has label, description, error association, character guidance, and status announcements.

**Responsive considerations:** Stack title/source fields and wrap document actions at 375px.

**Security considerations:** Render no raw provider error or external payload; keep workspace/brand relationship server-authoritative.

**M1–M13 regression risk:** Preserve embedding dimension validation, RAG isolation, indexing transitions, and route payloads.

**Database/migration:** None.

**Verification:** Run the existing knowledge panel/routes tests plus tests/knowledge-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: users understand indexing state without schema changes.

**Commit boundary recommendation:** feat: polish knowledge management experience.

## Task 9: AI generation surface

**Objective:** Improve streamed AI experience while retaining LLMProvider and safe prompt boundaries.

**Expected files:**

- Create app/(dashboard)/dashboard/ai/page.tsx.
- Create components/dashboard/ai-page.tsx.
- Create tests/ai-ui-state.test.ts.
- Modify components/forms/ai-generation-panel.tsx.

**Tests written first:**

- Prompt and brand selection are labeled and disabled correctly while streaming.
- Stream start, text update, completion, cancellation, provider-unavailable, and unknown-error states map to safe announcements.
- Leaving the route aborts the request.
- Brand context is preserved only as a valid selected workspace/brand pair.

**Implementation work:**

- Use the existing /api/ai/generate SSE contract.
- Add prompt guidance, status live regions, cancel control, bounded output, and safe retry only for an explicit new request.
- Keep useBrandContext and brand ID request shapes unchanged.

**Accessibility considerations:** Stream status is announced without making every token a disruptive alert; output has a heading and readable focus behavior.

**Responsive considerations:** Prompt and result stack at 375px; long output wraps and remains scrollable in a bounded region.

**Security considerations:** Never place credentials, provider URLs, model internals, or raw provider errors in output or browser logs.

**M1–M13 regression risk:** Preserve provider-neutral behavior, prompt bounds, RAG trust delimiters, idempotency, and readiness semantics.

**Database/migration:** None.

**Verification:** Run existing AI route/streaming tests plus tests/ai-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: streaming remains provider-neutral and cancellation is explicit.

**Commit boundary recommendation:** feat: improve AI generation experience.

## Task 10: Agents surface

**Objective:** Separate agent definition management, execution, and bounded history in an accessible route.

**Expected files:**

- Create app/(dashboard)/dashboard/agents/page.tsx.
- Create components/dashboard/agents-page.tsx.
- Create tests/agents-ui-state.test.ts.
- Modify components/forms/agent-panel.tsx.

**Tests written first:**

- Members see/run only what the existing API permits; management actions honor server responses.
- Agent creation/edit validation preserves entered values on error.
- Delete requires confirmation and preserves run-history behavior.
- Run pending, success, cancellation, quota, concurrency, and provider failure states are distinct.
- History remains bounded and safe.

**Implementation work:**

- Use existing agents, agent resource, run, and run-history routes.
- Reuse safe tool catalog presentation; do not add integration tools.
- Add confirmation and live-region feedback.

**Accessibility considerations:** Agent cards use headings, labeled run controls, status text, and keyboard-accessible history expansion.

**Responsive considerations:** Stack agent cards and place run actions below metadata on narrow screens.

**Security considerations:** Preserve AgentRunner’s trusted principal, static tools, workspace/brand checks, and no shell/tool expansion.

**M1–M13 regression risk:** Preserve synchronous execution, cancellation propagation, usage admission, and soft deletion.

**Database/migration:** None.

**Verification:** Run existing agent route/authorization tests plus tests/agents-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: the agent experience is clearer without changing the controlled runtime.

**Commit boundary recommendation:** feat: polish agent management experience.

## Task 11: Workflows and accessible editor fallback

**Objective:** Make workflow creation, editing, execution, and mobile inspection understandable without changing the workflow engine.

**Expected files:**

- Create app/(dashboard)/dashboard/workflows/page.tsx.
- Create components/dashboard/workflows-page.tsx.
- Create components/workflow-editor/workflow-step-list.tsx.
- Create tests/workflow-ui-state.test.ts.
- Modify components/forms/workflow-panel.tsx.
- Modify components/forms/workflow-editor.tsx.
- Modify components/workflow-editor/workflow-canvas.tsx.
- Modify components/workflow-editor/workflow-json-editor.tsx.

**Tests written first:**

- Workflow list renders enabled/disabled state and safe run status.
- Invalid JSON preserves input and maps to a form error.
- Visual and Advanced JSON views round-trip the same definition.
- Stale expectedVersionId maps to a conflict without discarding edits.
- Step-list fallback exposes every registered step, safe configuration summary, approval requirement, integration metadata, and JSON access.
- Mobile viewport chooses list/JSON fallback and does not require canvas dragging.
- AMBIGUOUS integration status is terminal and has no retry action.

**Implementation work:**

- Keep existing workflow routes, immutable versions, layout persistence, and server validation.
- Lazy-load React Flow from this route.
- Add accessible step list and a labeled canvas region.
- Make workflow run/cancel status and deferred/approval states explicit.
- Confirm disable/delete actions where supported by existing routes.

**Accessibility considerations:** The step list/JSON mode is the equivalent safe interaction path. Canvas controls receive labels; no claim of full keyboard graph manipulation is made.

**Responsive considerations:** Use list/JSON below the mobile breakpoint; stack run/action bars and bound JSON scrolling.

**Security considerations:** Preserve static step registry, credential ID-only snapshots, approval policy, workspace checks, and no arbitrary execution.

**M1–M13 regression risk:** This is the highest-risk UI refactor. Run workflow editor, schema, service, integration, outbox, approval, and worker suites before and after.

**Database/migration:** None.

**Verification:** Run existing workflow editor, integration, approval, and outbox suites plus tests/workflow-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: the editor remains server-validated and the fallback is usable.

**Commit boundary recommendation:** feat: add accessible workflow editing experience.

## Task 12: Schedules surface

**Objective:** Present PostgreSQL-authoritative schedules and bounded occurrence history clearly.

**Expected files:**

- Create app/(dashboard)/dashboard/schedules/page.tsx.
- Create components/dashboard/schedules-page.tsx.
- Create tests/schedules-ui-state.test.ts.
- Modify components/forms/schedule-panel.tsx.

**Tests written first:**

- CRON, interval, and one-time fields render according to type.
- Member read-only behavior and admin/owner mutation behavior follow API responses.
- Enable/disable/delete confirmation states are accessible.
- Misfire and consumed one-time statuses are not presented as editable when the server rejects edits.

**Implementation work:**

- Reuse schedule and occurrence routes.
- Show timezone, next run, enabled state, and bounded history.
- Map quota, validation, consumed, and scheduler errors safely.

**Accessibility considerations:** Dynamic fields announce changes and expose labels/descriptions for timezone and recurrence syntax.

**Responsive considerations:** Stack recurrence fields and wrap occurrence rows at 375px.

**Security considerations:** Do not expose scheduler internals or permit client-side schedule execution.

**M1–M13 regression risk:** Preserve schedule validation, occurrence uniqueness, scheduler heartbeat, and automation-principal semantics.

**Database/migration:** None.

**Verification:** Run existing schedule panel/routes/authorization tests plus tests/schedules-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: schedule UI reflects database state and creates no repeatable queue jobs.

**Commit boundary recommendation:** feat: polish schedule management experience.

## Task 13: Webhooks surface

**Objective:** Make secure inbound webhook configuration and history understandable without weakening ingress security.

**Expected files:**

- Create app/(dashboard)/dashboard/webhooks/page.tsx.
- Create components/dashboard/webhooks-page.tsx.
- Create tests/webhooks-ui-state.test.ts.
- Modify components/forms/webhook-panel.tsx.

**Tests written first:**

- Create and rotate show one-time secret state and never re-render it after clearing.
- Copy action exposes safe success feedback without storing the secret.
- Event history shows hashes, sizes, status, duplicates, and run link only.
- Members can read while role-authorized users mutate.
- Rotate/disable/delete use confirmation.

**Implementation work:**

- Reuse workflow webhook management and event routes.
- Use safe event status formatting and time elements.
- Keep endpoint display bounded and copyable without accepting arbitrary target URLs.

**Accessibility considerations:** The one-time secret region has an accessible warning and copy control; history rows have headings and status text.

**Responsive considerations:** Long endpoints wrap or use bounded copy controls; history rows become cards.

**Security considerations:** Preserve HMAC, timestamp, replay, and deduplication behavior; never log or persist the one-time secret in browser state.

**M1–M13 regression risk:** Preserve public webhook protocol and safe event projections.

**Database/migration:** None.

**Verification:** Run existing webhook panel/routes/public-route tests plus tests/webhooks-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: UI improves without changing ingress or secret storage.

**Commit boundary recommendation:** feat: polish secure webhook experience.

## Task 14: Approval inbox

**Objective:** Provide a clear human approval inbox while preserving human-only decisions and state races.

**Expected files:**

- Create app/(dashboard)/dashboard/approvals/page.tsx.
- Create components/dashboard/approvals-page.tsx.
- Create tests/approvals-ui-state.test.ts.
- Modify components/forms/approval-panel.tsx.

**Tests written first:**

- Pending, approved, rejected, expired, and cancelled states render distinct text.
- Member view has no decision control; authorized roles receive approve/reject controls.
- Double decision maps WORKFLOW_APPROVAL_ALREADY_DECIDED safely.
- Expired approval has no active decision action.
- Review text and context remain bounded.

**Implementation work:**

- Use existing approval list/detail/approve/reject routes.
- Add safe status filtering.
- Require confirmation for reject and optionally approve when consequential.

**Accessibility considerations:** Filters are labeled; decision results are announced; focus returns to the updated request.

**Responsive considerations:** Approval cards replace wide tables on mobile; decision actions stack.

**Security considerations:** Only server authorization decides eligibility. Automation principals, agents, webhooks, and workflow input never gain decision access.

**M1–M13 regression risk:** Preserve decision races, expiration, cancellation, continuation generation, and required-role policy.

**Database/migration:** None.

**Verification:** Run existing workflow approval route/service tests plus tests/approvals-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: approval state remains durable and human-only.

**Commit boundary recommendation:** feat: add accessible approval inbox.

## Task 15: Integration credential experience

**Objective:** Make the Slack credential vault understandable while keeping credentials server-only.

**Expected files:**

- Create app/(dashboard)/dashboard/integrations/page.tsx.
- Create components/dashboard/integrations-page.tsx.
- Create tests/integrations-ui-state.test.ts.
- Modify components/forms/integration-panel.tsx.
- Modify components/integrations/credential-form.tsx.
- Modify components/integrations/credential-list.tsx.

**Tests written first:**

- Catalog shows only Slack and post_message.
- Token input clears after submission and never appears in a credential list response.
- Rotate uses replacement-token dialog and revoke uses confirmation.
- MEMBER sees safe metadata only; OWNER/ADMIN controls follow server responses.
- Quota, unavailable, and ambiguous statuses render without retrying ambiguous actions.

**Implementation work:**

- Replace window.prompt/window.confirm with accessible project dialogs.
- Reuse credential APIs and existing UI helpers.
- Explain that egress is disabled by default and no generic HTTP exists.

**Accessibility considerations:** Password inputs have labels/descriptions; dialogs handle focus; statuses never echo tokens.

**Responsive considerations:** Credential metadata becomes cards and token forms remain usable at 375px.

**Security considerations:** Keep INTEGRATION_EGRESS_ENABLED=false, Slack-only policy, encrypted vault, credential ID-only workflow snapshots, and no AgentRunner integration tools.

**M1–M13 regression risk:** Run integration secret, policy, route, action-state, and recovery tests.

**Database/migration:** None.

**Verification:** Run existing integration panel/routes/secrets/policy tests plus tests/integrations-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: fake credentials can be managed safely without outbound requests.

**Commit boundary recommendation:** feat: polish secure integration credentials.

## Task 16: Usage and operations surface

**Objective:** Promote existing safe M12 operations projections to a first-class route.

**Expected files:**

- Create app/(dashboard)/dashboard/operations/page.tsx.
- Create components/dashboard/operations-page.tsx.
- Create tests/operations-ui-state.test.ts.
- Modify components/forms/operations-panel.tsx.
- Modify components/forms/usage-summary.tsx.

**Tests written first:**

- Usage limits, counters, concurrency, rate-limit degradation, and deferred dispatch count render from the existing response shape.
- Unauthorized MEMBER response becomes a safe access state.
- Loading and unavailable states do not expose internal diagnostics.
- Progress bars have accessible values and text alternatives.

**Implementation work:**

- Use /api/workspaces/:id/usage and /api/workspaces/:id/operations unchanged.
- Add a bounded refresh control with explicit user action.
- Keep projections free of prompts, responses, credential material, raw bodies, provider payloads, and queue payloads.

**Accessibility considerations:** Progress uses role=progressbar with labels/values; status counts are readable without color.

**Responsive considerations:** Dense cards become one-column summaries at 375px.

**Security considerations:** Preserve OWNER/ADMIN projection authorization and M12 redaction.

**M1–M13 regression risk:** Do not alter usage admission, concurrency, retention, readiness, or operations SQL.

**Database/migration:** None.

**Verification:** Run existing operations UI and workspace operations route/authorization tests plus tests/operations-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: operations is independently navigable with safe projections.

**Commit boundary recommendation:** feat: add workspace operations experience.

## Task 17: Workspace settings and membership

**Objective:** Provide a focused settings route using existing workspace and membership APIs.

**Expected files:**

- Create app/(dashboard)/dashboard/settings/page.tsx.
- Create components/dashboard/settings-page.tsx.
- Create tests/settings-ui-state.test.ts.
- Modify components/forms/workspace-brand-panel.tsx only to remove settings responsibilities.

**Tests written first:**

- OWNER, ADMIN, and MEMBER controls match the existing action map.
- Adding an ADMIN is owner-only; admin/member changes are handled by server response.
- Last-owner and owner-protected errors render safely.
- Leave and workspace deletion require confirmation.
- Workspace switching clears settings state.

**Implementation work:**

- Reuse workspace resource, membership list, role, removal, and leave routes.
- Present role and membership state as safe metadata.
- Keep deletion and leave controls visibly destructive and separate from normal saves.

**Accessibility considerations:** Settings sections have headings, form descriptions, confirmation dialogs, and focus restoration.

**Responsive considerations:** Membership rows become cards; action menus remain keyboard accessible.

**Security considerations:** Never allow client role editing to bypass canManageMembership, owner protection, or server checks.

**M1–M13 regression risk:** Preserve role model, audit events, last-owner protections, and workspace isolation.

**Database/migration:** None.

**Verification:** Run existing workspace-membership and authorization tests plus tests/settings-ui-state.test.ts, npm run typecheck, and npm run lint. Expected result: settings reflects current membership authority without new roles.

**Commit boundary recommendation:** feat: add workspace settings experience.

## Task 18: Accessibility hardening

**Objective:** Prove and correct cross-surface WCAG-oriented behavior after feature migration.

**Expected files:**

- Create tests/e2e/responsive-accessibility.spec.ts.
- Create tests/accessibility-contract.test.ts.
- Modify app/globals.css.
- Modify shared UI primitives and affected route components.

**Tests written first:**

- Keyboard-only journey signs in, opens navigation, switches workspace, fills a form, opens/confirms a dialog, and reaches an approval decision.
- Axe scans run on sign-in, overview, knowledge, workflow fallback, integrations, and mobile navigation.
- Contract test checks one h1, skip link, live-region semantics, labels, invalid-field wiring, and icon-only labels.

**Implementation work:**

- Fix focus order, dialog trapping/restoration, menu Escape behavior, error descriptions, heading levels, contrast, reduced motion, and timestamp semantics.
- Add accessible names to React Flow controls and step-list alternative.
- Resolve all serious/critical axe violations; document any intentionally suppressed rule with a test reason.

**Accessibility considerations:** This task owns cross-surface WCAG acceptance; no color-only status or mouse-only workflow remains.

**Responsive considerations:** Run keyboard and axe scans at 375px and 1280px.

**Security considerations:** Accessibility changes must not expose hidden credentials or raw server data.

**M1–M13 regression risk:** Avoid changing server-rendered error or auth boundaries while changing markup.

**Database/migration:** None.

**Verification:** Run npm test -- --run tests/accessibility-contract.test.ts and npm exec playwright test tests/e2e/responsive-accessibility.spec.ts. Expected result: no critical axe violations and a successful keyboard journey.

**Commit boundary recommendation:** test: harden M14 accessibility coverage.

## Task 19: Responsive hardening

**Objective:** Verify and correct the 375px, 768px, and 1280px layouts.

**Expected files:**

- Create tests/e2e/responsive.spec.ts.
- Modify route containers, shared primitives, components/flowyn-shell.tsx, and app/globals.css.

**Tests written first:**

- Mobile navigation opens/closes without horizontal overflow.
- Forms, dialogs, history cards, long AI output, webhook endpoints, and operations summaries remain usable at 375px.
- Tablet navigation and two-column forms remain readable at 768px.
- Desktop shell and editor fit within bounded content at 1280px.
- Mobile workflow opens list/JSON fallback.

**Implementation work:**

- Add responsive class refinements only where tests identify overflow or inaccessible action placement.
- Keep primary actions visible and stack secondary actions.
- Use bounded scroll containers for long code, JSON, and output content.

**Accessibility considerations:** Responsive changes retain focus order, accessible names, and keyboard reachability.

**Responsive considerations:** The three target widths are acceptance fixtures, not approximate visual guidance.

**Security considerations:** No responsive version may omit server error or permission handling.

**M1–M13 regression risk:** Avoid layout changes that remove existing workflow controls or one-time secret warnings.

**Database/migration:** None.

**Verification:** Run npm exec playwright test tests/e2e/responsive.spec.ts, npm run typecheck, and npm run lint. Expected result: no target viewport has horizontal overflow or unreachable primary action.

**Commit boundary recommendation:** feat: harden responsive product layouts.

## Task 20: Performance and code-splitting hardening

**Objective:** Prevent the former all-panel dashboard from loading unrelated feature code and data.

**Expected files:**

- Create tests/performance-ui-contract.test.ts.
- Modify app/(dashboard)/dashboard/page.tsx.
- Modify route pages and loading boundaries.
- Modify components/forms/workflow-editor.tsx.
- Modify components/flowyn-shell.tsx.

**Tests written first:**

- Overview request assertions prove it does not fetch every feature endpoint.
- Workflow route loads the editor chunk only after the workflow surface is opened.
- Workspace switching aborts stale requests.
- Bounded history requests retain explicit limits.
- AI stream cleanup aborts on unmount.

**Implementation work:**

- Use route-level imports and dynamic React Flow import.
- Keep shell and overview lightweight.
- Add loading boundaries rather than blocking navigation on provider-dependent data.
- Memoize only stable, expensive presentation components.

**Accessibility considerations:** Loading boundaries preserve headings and announce meaningful progress without repeated noise.

**Responsive considerations:** Performance changes do not remove mobile fallbacks or critical navigation controls.

**Security considerations:** Request cancellation must not duplicate mutations or create implicit retries.

**M1–M13 regression risk:** Do not move server authorization or workflow execution into client code.

**Database/migration:** None.

**Verification:** Run npm test -- --run tests/performance-ui-contract.test.ts, npm run build, npm run typecheck, and npm run lint. Expected result: production build succeeds with route-level feature loading and unchanged API contracts.

**Commit boundary recommendation:** perf: split dashboard feature loading.

## Task 21: Full browser journeys and regression verification

**Objective:** Prove every critical M14 journey against an isolated environment and verify M1–M13 compatibility.

**Expected files:**

- Create tests/e2e/auth.spec.ts.
- Create tests/e2e/workspace-brand.spec.ts.
- Create tests/e2e/knowledge-ai.spec.ts.
- Create tests/e2e/agents-workflows.spec.ts.
- Create tests/e2e/schedules-webhooks.spec.ts.
- Create tests/e2e/approvals-integrations.spec.ts.
- Create tests/e2e/operations-settings.spec.ts.
- Create tests/e2e/isolation.spec.ts.
- Modify package.json only for test commands if needed.

**Tests written first:** Implement the twenty journeys in the design specification, with each test using unique run-scoped data and role-based locators.

**Implementation work:**

- Add deterministic fixtures for user, workspace, brand, document, agent, workflow, schedule, webhook, approval, and fake credential lifecycle.
- Use existing UI/API flows and never bypass authorization in the browser suite.
- Use direct API setup only for data that would make the browser journey nondeterministic, then assert the relevant UI projection.
- Assert no fake credential/token appears in visible page content after submission.

**Accessibility considerations:** Include keyboard-only and axe tests in the default Chromium suite.

**Responsive considerations:** Include mobile navigation and workflow fallback fixtures.

**Security considerations:** Do not set RUN_SLACK_INTEGRATION=1; do not provide INTEGRATION_TEST_SLACK_TOKEN; do not log sensitive response bodies.

**M1–M13 regression risk:** Run all existing Vitest suites, including workflow, approval, webhook, integration, quota, readiness, and workspace isolation tests.

**Database/migration:** Use a clean temporary database for browser runs and separately verify the existing PostgreSQL database without resetting it.

**Verification:**

- Run npm run typecheck.
- Run npm run lint.
- Run npm test -- --run.
- Run npm run build.
- Run docker compose config.
- Run docker compose up -d --build.
- Run docker compose ps.
- Run npm run test:e2e.
- Run .\scripts\verify-local.ps1.

Expected result: all static, unit, build, Docker, local, and browser checks pass; existing data and volumes remain intact.

**Commit boundary recommendation:** test: verify M14 browser journeys and regressions.

## Task 22: Documentation and final traceability

**Objective:** Update product documentation and prove every acceptance criterion has evidence.

**Expected files:**

- Modify README.md.
- Modify ARCHITECTURE.md.
- Modify SETUP.md.
- Create docs/operations/browser-testing.md.
- Create tests/documentation-m14.test.ts.

**Tests written first:**

- Documentation contract checks approved routes, M14 verification commands, browser prerequisites, no-migration policy, fake Slack rule, M15 boundary, and the current M1–M13 baseline.
- Documentation checks reject stale “Milestones 1 through 12” claims and early-milestone dashboard copy.

**Implementation work:**

- Document local browser setup, isolated test database, browser installation, trace handling, fake integration credentials, and no-real-Slack policy.
- Update README and architecture references without rewriting M1–M13 backend decisions.
- Record the M15 boundary explicitly.

**Accessibility considerations:** Documentation describes keyboard and axe verification.

**Responsive considerations:** Documentation records the 375px, 768px, and 1280px target widths.

**Security considerations:** Documentation contains no real secrets, tokens, production environment files, or credential examples that could be mistaken for usable values.

**M1–M13 regression risk:** Documentation tests assert existing security boundaries and migration immutability remain described.

**Database/migration:** None; documentation states that M14 generated no migration.

**Verification:** Run npm test -- --run tests/documentation-m14.test.ts, git diff --check, and git status --short. Expected result: documentation is internally consistent, only approved M14 files are changed, and no M15 implementation appears.

**Commit boundary recommendation:** docs: document M14 product experience validation.

## Acceptance traceability matrix

| Acceptance criterion | Implementation task | Unit/component evidence | Browser evidence | Accessibility evidence | Regression verification |
| --- | --- | --- | --- | --- | --- |
| Approved routes are reachable | 4–17 | Navigation and route contract tests | Route smoke coverage across feature specs | Active link, landmark, and heading assertions | Build and existing route tests |
| Onboarding is server-derived | 6 | tests/onboarding-state.test.ts | New, partial, completed, and switching journeys | Checklist state announcements | Workspace, brand, knowledge, agent, and workflow suites |
| Consistent UI states | 3, 7–17 | State-specific UI contract tests | Loading, empty, error, success journey assertions | Live region and status scans | Full Vitest suite |
| Forms are labeled and keyboard usable | 3, 7–17 | Form/error contracts | Form journeys | Keyboard and axe suite | Typecheck, lint, and build |
| Destructive actions confirm | 3, 7, 11–17 | Dialog contract tests | Delete, revoke, rotate, and decision journeys | Focus trap/restoration tests | Authorization and mutation suites |
| Responsive behavior works | 4, 11–20 | Responsive contracts | 375, 768, and 1280 viewport tests | Mobile keyboard/axe scans | Build and E2E |
| Workflow has non-canvas access | 11 | Step-list and JSON state tests | Workflow fallback and round-trip journeys | Keyboard/list/JSON assertions | Workflow editor/schema/service suites |
| Error mapper is safe and complete | 2 | tests/client-api.test.ts | Conflict/quota/provider/ambiguous cases | Error descriptions/live regions | API and security tests |
| Workspace isolation is preserved | 5, 7–17 | Context and role tests | Cross-workspace isolation journey | No hidden-state-only authorization assumptions | Existing isolation/authorization suites |
| Secrets and integration boundaries remain intact | 13, 15, 21 | Secret/policy UI contracts | Fake credential and one-time secret tests | Secret warning/copy accessibility | Integration, webhook, and security suites |
| Browser validation is deterministic | 1, 21 | Fixture/config contract tests | Full twenty-journey suite | Axe and keyboard coverage | Clean temporary DB plus existing DB verification |
| M15 is excluded | 1, 21, 22 | Documentation contract | No real Slack or release journey | Not applicable | Diff review and M15 exclusion scan |

## Execution checkpoints

At the end of every task, run npm run typecheck, npm run lint, npm test -- --run focused-tests, and git diff --check.

Before any eventual M14 implementation commit, additionally run npm test -- --run, npm run build, docker compose config, docker compose up -d --build, docker compose ps, .\scripts\verify-local.ps1, and npm run test:e2e.

Pause implementation if a task requires a migration, changes an M1–M13 backend security boundary, needs a real credential, or cannot preserve existing Docker data.

## Plan self-review

- All twenty-two requested implementation areas have a dedicated task in the requested order.
- Every task identifies exact expected files, tests-first behavior, implementation work, accessibility, responsive, security, regression, migration, verification, and commit-boundary guidance.
- The plan introduces no database migration and no production runtime dependency.
- Playwright and axe are development-only candidates with reviewed versions; no installation is authorized by this document.
- Workflow, webhook, approval, integration, workspace, AI, RAG, agent, quota, scheduler, outbox, and readiness boundaries are preserved.
- M15 release-candidate and production activities are explicitly excluded.
