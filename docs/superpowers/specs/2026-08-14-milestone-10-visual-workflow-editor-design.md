# Milestone 10 — Server-Validated Visual Workflow Editor

## Objective

Milestone 10 adds a visual authoring interface for Flowyn's existing workflow engine. The visual editor is a projection of the existing `WorkflowDefinition`; it is not an execution model and does not introduce a second workflow runtime.

The authoritative path remains:

```text
visual editor -> WorkflowDefinition -> existing Zod/graph/resource validation -> immutable workflow version -> existing durable runtime
```

M10 supports exactly the six step types already registered by the static workflow registry: `SET_VALUE`, `TRANSFORM`, `CONDITION`, `AI_GENERATE`, `AGENT`, and `APPROVAL`. Schedules and webhooks remain separate workflow trigger resources.

## Decisions

- Persist current visual layout in a separate metadata-only table. Layout never contributes to definition hashes, immutable definitions, workflow snapshots, authorization, scheduling, webhooks, approvals, or execution.
- Store only the current layout associated with the workflow and the executable version it represents. Historical layouts are out of scope.
- Extend `GET /api/workflows/:id` with the authorized editor projection and keep `PATCH /api/workflows/:id` as the authoritative save path.
- Definition-changing saves require `expectedVersionId`, which is checked transactionally against the existing `currentVersionId`. Stale saves return `409 WORKFLOW_VERSION_CONFLICT` without automatic merging.
- Every executable definition save validates referenced agents and brands regardless of workflow enabled state. Enabling or running may apply additional usability checks.
- Retain Advanced JSON mode and route it through the same definition conversion and server validation.
- Use `@xyflow/react` as the only new canvas dependency after compatibility verification. No other graph library is permitted.
- Do not add import/export, templates, collaborative editing, new step types, arbitrary loops, external integrations, or any new external trust boundary.

## Existing constraints preserved

The server remains authoritative for strict schema validation, graph reachability, acyclicity, ancestor-only references, bounded JSON, workspace membership, agent ownership, brand ownership, immutable version creation, and workflow execution. Existing LLMProvider, BrandContext/RAG, AgentRunner, scheduler, webhook, approval, outbox, BullMQ, worker, audit, and error-handling boundaries remain unchanged.

## Layout model

If persistence is enabled, `workflow_editor_layouts` stores one current layout per workflow with the `workflowVersionId` it represents. Its bounded JSON contains node positions and viewport information only. A version mismatch causes the UI to derive a deterministic default layout instead of mutating executable data.

## Concurrency

The existing `currentVersionId` is the optimistic-concurrency token. The workflow row is locked in the save transaction; the token must match before a new immutable version or current layout is written. The client retains unsaved state on a conflict and reloads only after an explicit user choice.

## Security

Canvas state, raw JSON, node positions, and client resource IDs are untrusted. The implementation must not add dynamic execution, arbitrary network access, shell, SQL, filesystem, browser automation, credentials, secrets, or HTML injection. The existing centralized authorization and non-leaking workspace isolation remain authoritative.

## Explicit M11 exclusions

Outbound integrations, generic HTTP, OAuth, external credentials, Gmail, Slack, Shopify, LinkedIn, external approval channels, browser automation, file uploads, multi-agent orchestration, billing, marketplace features, quotas, production deployment, workflow import/export, templates, collaborative editing, arbitrary loops, new orchestration semantics, and arbitrary shell/code/SQL/filesystem execution remain excluded.
