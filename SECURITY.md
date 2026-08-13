# Security

## Implemented controls

- Better Auth password authentication and database-backed sessions.
- Server-side session lookup for protected routes.
- Server-side workspace membership checks for workspace and brand operations.
- Zod validation for workspace, brand, and AI request bodies.
- 404 responses for resources outside the authenticated user’s workspace.
- Secrets kept in server environment variables and excluded from Git.
- Provider errors sanitized so connection URLs and credentials are not returned.
- Prompt length and generation token bounds.
- AI generation requires authenticated workspace membership; optional brand context is checked against the same workspace.
- AI provider configuration is server-side only; clients cannot select arbitrary endpoints or models.
- Generation logs store operational metadata only and exclude prompts, responses, credentials, URLs, and stack traces.
- Knowledge documents and chunks are workspace- and brand-scoped with server-side authorization and cascading ownership foreign keys.
- Semantic retrieval applies workspace and brand filters inside SQL before limiting results and never returns embeddings.
- Retrieved knowledge is delimited as untrusted prompt data and is never placed in the system instruction.
- Structured AI output is parsed and validated with Zod before application use.
- No shell execution, arbitrary code execution, or generic database tool is exposed to AI.
- Docker services use named volumes and explicit healthchecks.

## Credential handling

Never commit `.env.local`, database passwords, or provider secrets. The Compose defaults are development-only values. Replace `BETTER_AUTH_SECRET` before using a shared development machine.

## Workspace isolation rule

A resource ID is not an authorization decision. A protected service must:

1. Derive the user from the server session.
2. Resolve the resource and its owning workspace.
3. Verify active workspace membership.
4. Only then read or mutate the resource.

## Deferred controls

SSRF protection, encrypted integration credentials, rate limiting, CSRF policy review, file validation, webhook authentication, safe expression evaluation, and approval gates belong to later milestones because those surfaces do not exist yet. They must be implemented before HTTP tools, uploads, webhooks, or external integrations are enabled.

## Local AI boundary

Ollama is reachable on the local network by design. Generation and embedding routes use only trusted server configuration; users cannot select arbitrary model or endpoint URLs. The generation and knowledge routes require authenticated workspace access, do not allow model command execution, and do not expose raw provider errors or embeddings. Native streaming forwards text only.

## Reporting issues

Do not include secrets in issue reports. Include the route, error code, reproduction steps, and whether the issue occurs with host or Compose networking.
