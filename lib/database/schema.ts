import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { WorkspaceRole } from "@/lib/workspaces/roles";
import { embeddingVector } from "@/lib/database/vector";
import type { JsonValue, WorkflowDefinition } from "@/lib/workflows/types";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  ...timestamps,
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => user.id),
  ...timestamps,
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull().default("MEMBER"),
    ...timestamps,
  },
  (table) => ({
    userWorkspaceUnique: uniqueIndex("workspace_members_user_workspace_idx").on(table.workspaceId, table.userId),
    userIdx: index("workspace_members_user_idx").on(table.userId),
    roleCheck: check("workspace_members_role_check", sql`${table.role} in ('OWNER', 'ADMIN', 'MEMBER')`),
  }),
);

export const brands = pgTable("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => user.id),
  name: text("name").notNull(),
  description: text("description"),
  industry: text("industry"),
  website: text("website"),
  targetAudience: text("target_audience"),
  positioning: text("positioning"),
  valueProposition: text("value_proposition"),
  tone: text("tone"),
  personality: text("personality"),
  preferredVocabulary: jsonb("preferred_vocabulary").$type<string[]>().default([]).notNull(),
  forbiddenVocabulary: jsonb("forbidden_vocabulary").$type<string[]>().default([]).notNull(),
  writingRules: jsonb("writing_rules").$type<string[]>().default([]).notNull(),
  ctaPreferences: text("cta_preferences"),
  formattingPreferences: text("formatting_preferences"),
  productInformation: text("product_information"),
  ...timestamps,
}, (table) => ({
  workspaceIdx: index("brands_workspace_idx").on(table.workspaceId),
}));

export const brandVoiceProfiles = pgTable("brand_voice_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  brandId: uuid("brand_id").notNull().unique().references(() => brands.id, { onDelete: "cascade" }),
  structuredProfile: jsonb("structured_profile").$type<Record<string, unknown>>().notNull(),
  explanation: text("explanation"),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
  ...timestamps,
});

export const brandRules = pgTable("brand_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  explanation: text("explanation"),
  ...timestamps,
}, (table) => ({
  brandIdx: index("brand_rules_brand_idx").on(table.brandId),
}));

export const brandExamples = pgTable("brand_examples", {
  id: uuid("id").defaultRandom().primaryKey(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  source: text("source"),
  explanation: text("explanation"),
  ...timestamps,
}, (table) => ({
  brandIdx: index("brand_examples_brand_idx").on(table.brandId),
}));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  workspaceCreatedIdx: index("audit_logs_workspace_created_idx").on(table.workspaceId, table.createdAt),
}));

export const generationLogs = pgTable("generation_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  status: text("status").$type<"SUCCEEDED" | "FAILED">().notNull(),
  durationMs: integer("duration_ms").notNull(),
  inputChars: integer("input_chars").notNull(),
  outputChars: integer("output_chars"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  statusCheck: check("generation_logs_status_check", sql`${table.status} in ('SUCCEEDED', 'FAILED')`),
  workspaceCreatedIdx: index("generation_logs_workspace_created_idx").on(table.workspaceId, table.createdAt),
}));

export type AgentRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "MAX_STEPS_REACHED";
export type AgentRunStepType = "MODEL_DECISION" | "TOOL_CALL" | "TOOL_RESULT" | "FINAL_RESPONSE" | "ERROR";
export type AgentRunStepStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  systemInstructions: text("system_instructions").notNull().default(""),
  allowedTools: jsonb("allowed_tools").$type<string[]>().default([]).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  maxSteps: integer("max_steps").notNull().default(5),
  createdBy: text("created_by").notNull().references(() => user.id),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  workspaceIdx: index("agents_workspace_idx").on(table.workspaceId),
  brandIdx: index("agents_brand_idx").on(table.brandId),
  workspaceNameIdx: index("agents_workspace_name_idx").on(table.workspaceId, table.name),
  maxStepsCheck: check("agents_max_steps_check", sql`${table.maxSteps} > 0 and ${table.maxSteps} <= 100`),
}));

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  agentName: text("agent_name").notNull(),
  startedBy: text("started_by").references(() => user.id, { onDelete: "set null" }),
  status: text("status").$type<AgentRunStatus>().notNull().default("PENDING"),
  goal: text("goal").notNull(),
  stepCount: integer("step_count").notNull().default(0),
  finalResponse: text("final_response"),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  workspaceCreatedIdx: index("agent_runs_workspace_created_idx").on(table.workspaceId, table.createdAt),
  agentIdx: index("agent_runs_agent_idx").on(table.agentId),
  statusIdx: index("agent_runs_status_idx").on(table.workspaceId, table.status),
  statusCheck: check("agent_runs_status_check", sql`${table.status} in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'MAX_STEPS_REACHED')`),
}));

export const agentRunSteps = pgTable("agent_run_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  type: text("type").$type<AgentRunStepType>().notNull(),
  toolName: text("tool_name"),
  status: text("status").$type<AgentRunStepStatus>().notNull(),
  safeInputMetadata: jsonb("safe_input_metadata").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
  safeOutputMetadata: jsonb("safe_output_metadata").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  runIdx: index("agent_run_steps_run_idx").on(table.runId, table.stepNumber),
  workspaceIdx: index("agent_run_steps_workspace_idx").on(table.workspaceId),
  typeCheck: check("agent_run_steps_type_check", sql`${table.type} in ('MODEL_DECISION', 'TOOL_CALL', 'TOOL_RESULT', 'FINAL_RESPONSE', 'ERROR')`),
  statusCheck: check("agent_run_steps_status_check", sql`${table.status} in ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')`),
}));

export type WorkflowStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCEL_REQUESTED" | "CANCELLED" | "TIMED_OUT";
export type WorkflowStepRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "INTERRUPTED";
export type WorkflowDispatchStatus = "PENDING" | "CLAIMED" | "DISPATCHED" | "FAILED";
export type WorkflowScheduleType = "CRON" | "INTERVAL" | "ONE_TIME";
export type WorkflowScheduleMisfirePolicy = "SKIP" | "FIRE_ONCE";
export type WorkflowScheduleOccurrenceStatus = "TRIGGERED" | "SKIPPED" | "FAILED";
export type WorkflowWebhookEventStatus = "TRIGGERED" | "SKIPPED" | "FAILED";

export const workflows = pgTable("workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  currentVersion: integer("current_version").notNull().default(1),
  currentVersionId: uuid("current_version_id"),
  createdBy: text("created_by").notNull().references(() => user.id),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  workspaceIdx: index("workflows_workspace_idx").on(table.workspaceId),
  workspaceEnabledIdx: index("workflows_workspace_enabled_idx").on(table.workspaceId, table.enabled),
  currentVersionCheck: check("workflows_current_version_check", sql`${table.currentVersion} > 0`),
}));

export const workflowVersions = pgTable("workflow_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  definition: jsonb("definition").$type<WorkflowDefinition>().notNull(),
  definitionHash: text("definition_hash").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  workflowVersionIdx: uniqueIndex("workflow_versions_workflow_version_idx").on(table.workflowId, table.version),
  workspaceIdx: index("workflow_versions_workspace_idx").on(table.workspaceId),
  versionCheck: check("workflow_versions_version_check", sql`${table.version} > 0`),
}));

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  workflowVersion: integer("workflow_version").notNull(),
  workflowVersionId: uuid("workflow_version_id").notNull().references(() => workflowVersions.id),
  definitionSnapshot: jsonb("definition_snapshot").$type<WorkflowDefinition>().notNull(),
  status: text("status").$type<WorkflowStatus>().notNull().default("QUEUED"),
  startedBy: text("started_by").references(() => user.id, { onDelete: "set null" }),
  input: jsonb("input").$type<JsonValue>().notNull(),
  output: jsonb("output").$type<JsonValue>(),
  currentStepId: text("current_step_id"),
  idempotencyKey: text("idempotency_key"),
  executionToken: text("execution_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  workspaceCreatedIdx: index("workflow_runs_workspace_created_idx").on(table.workspaceId, table.createdAt),
  workflowIdx: index("workflow_runs_workflow_idx").on(table.workflowId),
  statusIdx: index("workflow_runs_status_idx").on(table.workspaceId, table.status),
  idempotencyIdx: uniqueIndex("workflow_runs_workspace_idempotency_idx").on(table.workspaceId, table.idempotencyKey),
  statusCheck: check("workflow_runs_status_check", sql`${table.status} in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'TIMED_OUT')`),
  versionCheck: check("workflow_runs_version_check", sql`${table.workflowVersion} > 0`),
}));

export const workflowSchedules = pgTable("workflow_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  type: text("type").$type<WorkflowScheduleType>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  cronExpression: text("cron_expression"),
  intervalSeconds: integer("interval_seconds"),
  runAt: timestamp("run_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("UTC"),
  misfirePolicy: text("misfire_policy").$type<WorkflowScheduleMisfirePolicy>().notNull().default("SKIP"),
  input: jsonb("input").$type<JsonValue>().notNull().default({}),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  lastProcessedAt: timestamp("last_processed_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  workspaceIdx: index("workflow_schedules_workspace_idx").on(table.workspaceId),
  dueIdx: index("workflow_schedules_due_idx").on(table.enabled, table.nextRunAt),
  workflowIdx: index("workflow_schedules_workflow_idx").on(table.workflowId),
  typeCheck: check("workflow_schedules_type_check", sql`${table.type} in ('CRON', 'INTERVAL', 'ONE_TIME')`),
  misfirePolicyCheck: check("workflow_schedules_misfire_policy_check", sql`${table.misfirePolicy} in ('SKIP', 'FIRE_ONCE')`),
  intervalCheck: check("workflow_schedules_interval_check", sql`(
    (${table.type} = 'CRON' and ${table.cronExpression} is not null and ${table.intervalSeconds} is null and ${table.runAt} is null)
    or (${table.type} = 'INTERVAL' and ${table.cronExpression} is null and ${table.intervalSeconds} is not null and ${table.runAt} is null)
    or (${table.type} = 'ONE_TIME' and ${table.cronExpression} is null and ${table.intervalSeconds} is null and ${table.runAt} is not null)
  )`),
}));

export const workflowScheduleOccurrences = pgTable("workflow_schedule_occurrences", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  scheduleId: uuid("schedule_id").notNull().references(() => workflowSchedules.id, { onDelete: "cascade" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  status: text("status").$type<WorkflowScheduleOccurrenceStatus>().notNull(),
  workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, { onDelete: "set null" }),
  reasonCode: text("reason_code"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  scheduleScheduledUnique: uniqueIndex("workflow_schedule_occurrences_schedule_scheduled_idx").on(table.scheduleId, table.scheduledFor),
  workspaceIdx: index("workflow_schedule_occurrences_workspace_idx").on(table.workspaceId, table.createdAt),
  runIdx: index("workflow_schedule_occurrences_run_idx").on(table.workflowRunId),
  statusCheck: check("workflow_schedule_occurrences_status_check", sql`${table.status} in ('TRIGGERED', 'SKIPPED', 'FAILED')`),
}));

export const workflowWebhookTriggers = pgTable("workflow_webhook_triggers", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
  publicId: text("public_id").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  secretCiphertext: text("secret_ciphertext").notNull(),
  secretKeyVersion: text("secret_key_version").notNull(),
  secretVersion: integer("secret_version").notNull().default(1),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  publicIdIdx: uniqueIndex("workflow_webhook_triggers_public_id_idx").on(table.publicId),
  workspaceIdx: index("workflow_webhook_triggers_workspace_idx").on(table.workspaceId),
  workflowIdx: index("workflow_webhook_triggers_workflow_idx").on(table.workflowId),
  enabledIdx: index("workflow_webhook_triggers_enabled_idx").on(table.enabled, table.deletedAt),
  secretVersionCheck: check("workflow_webhook_triggers_secret_version_check", sql`${table.secretVersion} > 0`),
}));

export const workflowWebhookEvents = pgTable("workflow_webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  triggerId: uuid("trigger_id").notNull().references(() => workflowWebhookTriggers.id, { onDelete: "cascade" }),
  externalEventIdHash: text("external_event_id_hash"),
  dedupeKey: text("dedupe_key").notNull(),
  dedupeWindowStart: timestamp("dedupe_window_start", { withTimezone: true }),
  payloadSha256: text("payload_sha256").notNull(),
  payloadBytes: integer("payload_bytes").notNull(),
  contentType: text("content_type").notNull(),
  secretVersion: integer("secret_version").notNull(),
  status: text("status").$type<WorkflowWebhookEventStatus>().notNull(),
  reasonCode: text("reason_code"),
  workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, { onDelete: "set null" }),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => ({
  dedupeIdx: uniqueIndex("workflow_webhook_events_trigger_dedupe_idx").on(table.triggerId, table.dedupeKey),
  workspaceReceivedIdx: index("workflow_webhook_events_workspace_received_idx").on(table.workspaceId, table.receivedAt),
  triggerReceivedIdx: index("workflow_webhook_events_trigger_received_idx").on(table.triggerId, table.receivedAt),
  workflowRunIdx: index("workflow_webhook_events_workflow_run_idx").on(table.workflowRunId),
  expiresIdx: index("workflow_webhook_events_expires_idx").on(table.expiresAt),
  payloadBytesCheck: check("workflow_webhook_events_payload_bytes_check", sql`${table.payloadBytes} > 0`),
  duplicateCountCheck: check("workflow_webhook_events_duplicate_count_check", sql`${table.duplicateCount} >= 0`),
  secretVersionCheck: check("workflow_webhook_events_secret_version_check", sql`${table.secretVersion} > 0`),
  statusCheck: check("workflow_webhook_events_status_check", sql`${table.status} in ('TRIGGERED', 'SKIPPED', 'FAILED')`),
}));

export const workflowStepRuns = pgTable("workflow_step_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowRunId: uuid("workflow_run_id").notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  stepId: text("step_id").notNull(),
  stepType: text("step_type").notNull(),
  attempt: integer("attempt").notNull(),
    status: text("status").$type<WorkflowStepRunStatus>().notNull(),
    executionToken: text("execution_token").notNull(),
  safeInput: jsonb("safe_input").$type<JsonValue>(),
  safeOutput: jsonb("safe_output").$type<JsonValue>(),
  safeMetadata: jsonb("safe_metadata").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
}, (table) => ({
  runIdx: index("workflow_step_runs_run_idx").on(table.workflowRunId, table.stepId),
  attemptIdx: uniqueIndex("workflow_step_runs_attempt_idx").on(table.workflowRunId, table.stepId, table.attempt),
  workspaceIdx: index("workflow_step_runs_workspace_idx").on(table.workspaceId),
  statusCheck: check("workflow_step_runs_status_check", sql`${table.status} in ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED')`),
  stepTypeCheck: check("workflow_step_runs_step_type_check", sql`${table.stepType} in ('SET_VALUE', 'TRANSFORM', 'CONDITION', 'AI_GENERATE', 'AGENT')`),
  attemptCheck: check("workflow_step_runs_attempt_check", sql`${table.attempt} > 0`),
}));

export const workflowRunDispatches = pgTable("workflow_run_dispatches", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull().unique().references(() => workflowRuns.id, { onDelete: "cascade" }),
  status: text("status").$type<WorkflowDispatchStatus>().notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  dispatcherId: text("dispatcher_id"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("workflow_run_dispatches_status_idx").on(table.status, table.leaseExpiresAt),
  statusCheck: check("workflow_run_dispatches_status_check", sql`${table.status} in ('PENDING', 'CLAIMED', 'DISPATCHED', 'FAILED')`),
  attemptsCheck: check("workflow_run_dispatches_attempts_check", sql`${table.attempts} >= 0`),
}));

export type KnowledgeIndexStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull().default("manual"),
  sourceName: text("source_name"),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
  contentHash: text("content_hash"),
  status: text("status").$type<KnowledgeIndexStatus>().notNull().default("PENDING"),
  errorCode: text("error_code"),
  ...timestamps,
}, (table) => ({
  workspaceBrandCreatedIdx: index("knowledge_documents_workspace_brand_created_idx").on(table.workspaceId, table.brandId, table.createdAt),
  brandIdx: index("knowledge_documents_brand_idx").on(table.brandId),
  statusCheck: check("knowledge_documents_status_check", sql`${table.status} in ('PENDING', 'PROCESSING', 'READY', 'FAILED')`),
}));

export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  stableKey: text("stable_key").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().default({}).notNull(),
  embedding: embeddingVector("embedding").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  documentChunkUnique: uniqueIndex("knowledge_chunks_document_stable_key_idx").on(table.documentId, table.stableKey),
  workspaceBrandIdx: index("knowledge_chunks_workspace_brand_idx").on(table.workspaceId, table.brandId),
  documentIdx: index("knowledge_chunks_document_idx").on(table.documentId),
  embeddingHnswIdx: index("knowledge_chunks_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
}));

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(workspaceMembers),
  createdAgents: many(agents),
  startedAgentRuns: many(agentRuns),
}));

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  brands: many(brands),
  knowledgeDocuments: many(knowledgeDocuments),
  knowledgeChunks: many(knowledgeChunks),
  agents: many(agents),
  agentRuns: many(agentRuns),
  agentRunSteps: many(agentRunSteps),
  workflows: many(workflows),
  workflowVersions: many(workflowVersions),
  workflowRuns: many(workflowRuns),
  workflowStepRuns: many(workflowStepRuns),
  workflowSchedules: many(workflowSchedules),
  workflowScheduleOccurrences: many(workflowScheduleOccurrences),
  workflowWebhookTriggers: many(workflowWebhookTriggers),
  workflowWebhookEvents: many(workflowWebhookEvents),
}));

export const brandRelations = relations(brands, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [brands.workspaceId], references: [workspaces.id] }),
  voiceProfile: one(brandVoiceProfiles),
  rules: many(brandRules),
  examples: many(brandExamples),
  knowledgeDocuments: many(knowledgeDocuments),
  knowledgeChunks: many(knowledgeChunks),
  agents: many(agents),
}));

export const agentRelations = relations(agents, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [agents.workspaceId], references: [workspaces.id] }),
  brand: one(brands, { fields: [agents.brandId], references: [brands.id] }),
  creator: one(user, { fields: [agents.createdBy], references: [user.id] }),
  runs: many(agentRuns),
}));

export const agentRunRelations = relations(agentRuns, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [agentRuns.workspaceId], references: [workspaces.id] }),
  agent: one(agents, { fields: [agentRuns.agentId], references: [agents.id] }),
  starter: one(user, { fields: [agentRuns.startedBy], references: [user.id] }),
  steps: many(agentRunSteps),
}));

export const agentRunStepRelations = relations(agentRunSteps, ({ one }) => ({
  run: one(agentRuns, { fields: [agentRunSteps.runId], references: [agentRuns.id] }),
  workspace: one(workspaces, { fields: [agentRunSteps.workspaceId], references: [workspaces.id] }),
}));

export const workflowRelations = relations(workflows, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [workflows.workspaceId], references: [workspaces.id] }),
  creator: one(user, { fields: [workflows.createdBy], references: [user.id] }),
  versions: many(workflowVersions),
  runs: many(workflowRuns),
  schedules: many(workflowSchedules),
  webhookTriggers: many(workflowWebhookTriggers),
}));

export const workflowVersionRelations = relations(workflowVersions, ({ one, many }) => ({
  workflow: one(workflows, { fields: [workflowVersions.workflowId], references: [workflows.id] }),
  workspace: one(workspaces, { fields: [workflowVersions.workspaceId], references: [workspaces.id] }),
  creator: one(user, { fields: [workflowVersions.createdBy], references: [user.id] }),
  runs: many(workflowRuns),
}));

export const workflowRunRelations = relations(workflowRuns, ({ one, many }) => ({
  workflow: one(workflows, { fields: [workflowRuns.workflowId], references: [workflows.id] }),
  version: one(workflowVersions, { fields: [workflowRuns.workflowVersionId], references: [workflowVersions.id] }),
  workspace: one(workspaces, { fields: [workflowRuns.workspaceId], references: [workspaces.id] }),
  starter: one(user, { fields: [workflowRuns.startedBy], references: [user.id] }),
  steps: many(workflowStepRuns),
  dispatch: one(workflowRunDispatches),
  scheduleOccurrences: many(workflowScheduleOccurrences),
  webhookEvents: many(workflowWebhookEvents),
}));

export const workflowScheduleRelations = relations(workflowSchedules, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [workflowSchedules.workspaceId], references: [workspaces.id] }),
  workflow: one(workflows, { fields: [workflowSchedules.workflowId], references: [workflows.id] }),
  creator: one(user, { fields: [workflowSchedules.createdBy], references: [user.id] }),
  occurrences: many(workflowScheduleOccurrences),
}));

export const workflowScheduleOccurrenceRelations = relations(workflowScheduleOccurrences, ({ one }) => ({
  workspace: one(workspaces, { fields: [workflowScheduleOccurrences.workspaceId], references: [workspaces.id] }),
  schedule: one(workflowSchedules, { fields: [workflowScheduleOccurrences.scheduleId], references: [workflowSchedules.id] }),
  workflowRun: one(workflowRuns, { fields: [workflowScheduleOccurrences.workflowRunId], references: [workflowRuns.id] }),
}));

export const workflowWebhookTriggerRelations = relations(workflowWebhookTriggers, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [workflowWebhookTriggers.workspaceId], references: [workspaces.id] }),
  workflow: one(workflows, { fields: [workflowWebhookTriggers.workflowId], references: [workflows.id] }),
  creator: one(user, { fields: [workflowWebhookTriggers.createdBy], references: [user.id] }),
  events: many(workflowWebhookEvents),
}));

export const workflowWebhookEventRelations = relations(workflowWebhookEvents, ({ one }) => ({
  workspace: one(workspaces, { fields: [workflowWebhookEvents.workspaceId], references: [workspaces.id] }),
  trigger: one(workflowWebhookTriggers, { fields: [workflowWebhookEvents.triggerId], references: [workflowWebhookTriggers.id] }),
  workflowRun: one(workflowRuns, { fields: [workflowWebhookEvents.workflowRunId], references: [workflowRuns.id] }),
}));

export const workflowStepRunRelations = relations(workflowStepRuns, ({ one }) => ({
  run: one(workflowRuns, { fields: [workflowStepRuns.workflowRunId], references: [workflowRuns.id] }),
  workspace: one(workspaces, { fields: [workflowStepRuns.workspaceId], references: [workspaces.id] }),
  agentRun: one(agentRuns, { fields: [workflowStepRuns.agentRunId], references: [agentRuns.id] }),
}));

export const workflowRunDispatchRelations = relations(workflowRunDispatches, ({ one }) => ({
  run: one(workflowRuns, { fields: [workflowRunDispatches.runId], references: [workflowRuns.id] }),
}));

export const knowledgeDocumentRelations = relations(knowledgeDocuments, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [knowledgeDocuments.workspaceId], references: [workspaces.id] }),
  brand: one(brands, { fields: [knowledgeDocuments.brandId], references: [brands.id] }),
  chunks: many(knowledgeChunks),
}));

export const knowledgeChunkRelations = relations(knowledgeChunks, ({ one }) => ({
  workspace: one(workspaces, { fields: [knowledgeChunks.workspaceId], references: [workspaces.id] }),
  brand: one(brands, { fields: [knowledgeChunks.brandId], references: [brands.id] }),
  document: one(knowledgeDocuments, { fields: [knowledgeChunks.documentId], references: [knowledgeDocuments.id] }),
}));

export const schema = {
  user,
  session,
  account,
  verification,
  workspaces,
  workspaceMembers,
  brands,
  brandVoiceProfiles,
  brandRules,
  brandExamples,
  auditLogs,
  generationLogs,
  agents,
  agentRuns,
  agentRunSteps,
  workflows,
  workflowVersions,
  workflowRuns,
  workflowSchedules,
  workflowScheduleOccurrences,
  workflowWebhookTriggers,
  workflowWebhookEvents,
  workflowStepRuns,
  workflowRunDispatches,
  knowledgeDocuments,
  knowledgeChunks,
};
