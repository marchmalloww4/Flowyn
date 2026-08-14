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
  knowledgeDocuments,
  knowledgeChunks,
};
