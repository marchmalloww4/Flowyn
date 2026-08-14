CREATE TABLE "workflow_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"trigger_id" uuid NOT NULL,
	"external_event_id_hash" text,
	"dedupe_key" text NOT NULL,
	"dedupe_window_start" timestamp with time zone,
	"payload_sha256" text NOT NULL,
	"payload_bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"secret_version" integer NOT NULL,
	"status" text NOT NULL,
	"reason_code" text,
	"workflow_run_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workflow_webhook_events_payload_bytes_check" CHECK ("workflow_webhook_events"."payload_bytes" > 0),
	CONSTRAINT "workflow_webhook_events_duplicate_count_check" CHECK ("workflow_webhook_events"."duplicate_count" >= 0),
	CONSTRAINT "workflow_webhook_events_secret_version_check" CHECK ("workflow_webhook_events"."secret_version" > 0),
	CONSTRAINT "workflow_webhook_events_status_check" CHECK ("workflow_webhook_events"."status" in ('TRIGGERED', 'SKIPPED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "workflow_webhook_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_key_version" text NOT NULL,
	"secret_version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workflow_webhook_triggers_secret_version_check" CHECK ("workflow_webhook_triggers"."secret_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "workflow_webhook_events" ADD CONSTRAINT "workflow_webhook_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_events" ADD CONSTRAINT "workflow_webhook_events_trigger_id_workflow_webhook_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."workflow_webhook_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_events" ADD CONSTRAINT "workflow_webhook_events_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_triggers" ADD CONSTRAINT "workflow_webhook_triggers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_triggers" ADD CONSTRAINT "workflow_webhook_triggers_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_webhook_triggers" ADD CONSTRAINT "workflow_webhook_triggers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_webhook_events_trigger_dedupe_idx" ON "workflow_webhook_events" USING btree ("trigger_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "workflow_webhook_events_workspace_received_idx" ON "workflow_webhook_events" USING btree ("workspace_id","received_at");--> statement-breakpoint
CREATE INDEX "workflow_webhook_events_trigger_received_idx" ON "workflow_webhook_events" USING btree ("trigger_id","received_at");--> statement-breakpoint
CREATE INDEX "workflow_webhook_events_workflow_run_idx" ON "workflow_webhook_events" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "workflow_webhook_events_expires_idx" ON "workflow_webhook_events" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_webhook_triggers_public_id_idx" ON "workflow_webhook_triggers" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "workflow_webhook_triggers_workspace_idx" ON "workflow_webhook_triggers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workflow_webhook_triggers_workflow_idx" ON "workflow_webhook_triggers" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_webhook_triggers_enabled_idx" ON "workflow_webhook_triggers" USING btree ("enabled","deleted_at");