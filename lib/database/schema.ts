import { relations } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    role: text("role").notNull().default("member"),
    ...timestamps,
  },
  (table) => ({
    userWorkspaceUnique: uniqueIndex("workspace_members_user_workspace_idx").on(table.workspaceId, table.userId),
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
});

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
});

export const brandExamples = pgTable("brand_examples", {
  id: uuid("id").defaultRandom().primaryKey(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  source: text("source"),
  explanation: text("explanation"),
  ...timestamps,
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(workspaceMembers),
}));

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  brands: many(brands),
}));

export const brandRelations = relations(brands, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [brands.workspaceId], references: [workspaces.id] }),
  voiceProfile: one(brandVoiceProfiles),
  rules: many(brandRules),
  examples: many(brandExamples),
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
};