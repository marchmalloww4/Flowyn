CREATE TABLE "workflow_run_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"dispatcher_id" text,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_dispatches_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "workflow_run_dispatches_status_check" CHECK ("workflow_run_dispatches"."status" in ('PENDING', 'CLAIMED', 'DISPATCHED', 'FAILED')),
	CONSTRAINT "workflow_run_dispatches_attempts_check" CHECK ("workflow_run_dispatches"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version" integer NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"definition_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"started_by" text,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"current_step_id" text,
	"idempotency_key" text,
	"execution_token" text,
	"lease_expires_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_runs_status_check" CHECK ("workflow_runs"."status" in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'TIMED_OUT')),
	CONSTRAINT "workflow_runs_version_check" CHECK ("workflow_runs"."workflow_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_step_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"step_type" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"safe_input" jsonb,
	"safe_output" jsonb,
	"safe_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"agent_run_id" uuid,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	CONSTRAINT "workflow_step_runs_status_check" CHECK ("workflow_step_runs"."status" in ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED')),
	CONSTRAINT "workflow_step_runs_step_type_check" CHECK ("workflow_step_runs"."step_type" in ('SET_VALUE', 'TRANSFORM', 'CONDITION', 'AI_GENERATE', 'AGENT')),
	CONSTRAINT "workflow_step_runs_attempt_check" CHECK ("workflow_step_runs"."attempt" > 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"definition_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_versions_version_check" CHECK ("workflow_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"current_version_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workflows_current_version_check" CHECK ("workflows"."current_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "workflow_run_dispatches" ADD CONSTRAINT "workflow_run_dispatches_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_run_dispatches_status_idx" ON "workflow_run_dispatches" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_workspace_created_idx" ON "workflow_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_workspace_idempotency_idx" ON "workflow_runs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "workflow_step_runs_run_idx" ON "workflow_step_runs" USING btree ("workflow_run_id","step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_step_runs_attempt_idx" ON "workflow_step_runs" USING btree ("workflow_run_id","step_id","attempt");--> statement-breakpoint
CREATE INDEX "workflow_step_runs_workspace_idx" ON "workflow_step_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_workflow_version_idx" ON "workflow_versions" USING btree ("workflow_id","version");--> statement-breakpoint
CREATE INDEX "workflow_versions_workspace_idx" ON "workflow_versions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workflows_workspace_idx" ON "workflows" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workflows_workspace_enabled_idx" ON "workflows" USING btree ("workspace_id","enabled");