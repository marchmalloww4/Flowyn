CREATE TABLE "workspace_concurrency_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation_class" text NOT NULL,
	"source_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspace_concurrency_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation_class" text NOT NULL,
	"active_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_concurrency_states_active_count_check" CHECK ("workspace_concurrency_states"."active_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_usage_admissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"operation_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"bucket_start" timestamp with time zone NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_usage_admissions_units_check" CHECK ("workspace_usage_admissions"."units" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_usage_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"consumed" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_usage_buckets_consumed_check" CHECK ("workspace_usage_buckets"."consumed" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "generation_logs" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "integration_action_runs" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "workflow_run_dispatches" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_run_dispatches" ADD COLUMN "defer_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_run_dispatches" ADD COLUMN "defer_reason" text;--> statement-breakpoint
ALTER TABLE "workflow_run_dispatches" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "workspace_concurrency_reservations" ADD CONSTRAINT "workspace_concurrency_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_concurrency_states" ADD CONSTRAINT "workspace_concurrency_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_usage_admissions" ADD CONSTRAINT "workspace_usage_admissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_usage_buckets" ADD CONSTRAINT "workspace_usage_buckets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_concurrency_reservations_workspace_expiry_idx" ON "workspace_concurrency_reservations" USING btree ("workspace_id","operation_class","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_concurrency_reservations_source_idx" ON "workspace_concurrency_reservations" USING btree ("workspace_id","operation_class","source_id") WHERE "workspace_concurrency_reservations"."released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_concurrency_states_workspace_operation_idx" ON "workspace_concurrency_states" USING btree ("workspace_id","operation_class");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_usage_admissions_workspace_metric_operation_idx" ON "workspace_usage_admissions" USING btree ("workspace_id","metric","operation_key");--> statement-breakpoint
CREATE INDEX "workspace_usage_admissions_workspace_created_idx" ON "workspace_usage_admissions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_usage_buckets_workspace_metric_bucket_idx" ON "workspace_usage_buckets" USING btree ("workspace_id","metric","bucket_start");--> statement-breakpoint
CREATE INDEX "workspace_usage_buckets_workspace_bucket_idx" ON "workspace_usage_buckets" USING btree ("workspace_id","bucket_start");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_workspace_idempotency_idx" ON "agent_runs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "workflow_run_dispatches" ADD CONSTRAINT "workflow_run_dispatches_defer_count_check" CHECK ("workflow_run_dispatches"."defer_count" >= 0);