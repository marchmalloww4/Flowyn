CREATE TABLE "workflow_schedule_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"workflow_run_id" uuid,
	"reason_code" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_schedule_occurrences_status_check" CHECK ("workflow_schedule_occurrences"."status" in ('TRIGGERED', 'SKIPPED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "workflow_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cron_expression" text,
	"interval_seconds" integer,
	"run_at" timestamp with time zone,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"misfire_policy" text DEFAULT 'SKIP' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_triggered_at" timestamp with time zone,
	"last_processed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workflow_schedules_type_check" CHECK ("workflow_schedules"."type" in ('CRON', 'INTERVAL', 'ONE_TIME')),
	CONSTRAINT "workflow_schedules_misfire_policy_check" CHECK ("workflow_schedules"."misfire_policy" in ('SKIP', 'FIRE_ONCE')),
	CONSTRAINT "workflow_schedules_interval_check" CHECK ((
    ("workflow_schedules"."type" = 'CRON' and "workflow_schedules"."cron_expression" is not null and "workflow_schedules"."interval_seconds" is null and "workflow_schedules"."run_at" is null)
    or ("workflow_schedules"."type" = 'INTERVAL' and "workflow_schedules"."cron_expression" is null and "workflow_schedules"."interval_seconds" is not null and "workflow_schedules"."run_at" is null)
    or ("workflow_schedules"."type" = 'ONE_TIME' and "workflow_schedules"."cron_expression" is null and "workflow_schedules"."interval_seconds" is null and "workflow_schedules"."run_at" is not null)
  ))
);
--> statement-breakpoint
ALTER TABLE "workflow_schedule_occurrences" ADD CONSTRAINT "workflow_schedule_occurrences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedule_occurrences" ADD CONSTRAINT "workflow_schedule_occurrences_schedule_id_workflow_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."workflow_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedule_occurrences" ADD CONSTRAINT "workflow_schedule_occurrences_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedules" ADD CONSTRAINT "workflow_schedules_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_schedule_occurrences_schedule_scheduled_idx" ON "workflow_schedule_occurrences" USING btree ("schedule_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "workflow_schedule_occurrences_workspace_idx" ON "workflow_schedule_occurrences" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_schedule_occurrences_run_idx" ON "workflow_schedule_occurrences" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "workflow_schedules_workspace_idx" ON "workflow_schedules" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workflow_schedules_due_idx" ON "workflow_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "workflow_schedules_workflow_idx" ON "workflow_schedules" USING btree ("workflow_id");