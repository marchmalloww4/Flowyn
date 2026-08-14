CREATE TABLE "integration_action_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"workflow_step_id" text NOT NULL,
	"workflow_step_run_id" uuid NOT NULL,
	"connector_id" text NOT NULL,
	"operation" text NOT NULL,
	"credential_id" uuid NOT NULL,
	"credential_secret_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_request_id" text,
	"safe_response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"safe_output" jsonb,
	"error_code" text,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_action_runs_status_check" CHECK ("integration_action_runs"."status" in ('PENDING', 'IN_FLIGHT', 'SUCCEEDED', 'FAILED', 'AMBIGUOUS', 'CANCELLED')),
	CONSTRAINT "integration_action_runs_attempt_check" CHECK ("integration_action_runs"."attempt" > 0),
	CONSTRAINT "integration_action_runs_credential_secret_version_check" CHECK ("integration_action_runs"."credential_secret_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "workflow_step_runs" DROP CONSTRAINT "workflow_step_runs_step_type_check";--> statement-breakpoint
ALTER TABLE "integration_action_runs" ADD CONSTRAINT "integration_action_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_action_runs" ADD CONSTRAINT "integration_action_runs_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_action_runs" ADD CONSTRAINT "integration_action_runs_workflow_step_run_id_workflow_step_runs_id_fk" FOREIGN KEY ("workflow_step_run_id") REFERENCES "public"."workflow_step_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_action_runs" ADD CONSTRAINT "integration_action_runs_credential_id_integration_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."integration_credentials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_action_runs_logical_action_idx" ON "integration_action_runs" USING btree ("workflow_run_id","workflow_step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_action_runs_workspace_idempotency_idx" ON "integration_action_runs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "integration_action_runs_workspace_status_idx" ON "integration_action_runs" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "integration_action_runs_workflow_run_idx" ON "integration_action_runs" USING btree ("workflow_run_id");--> statement-breakpoint
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_step_type_check" CHECK ("workflow_step_runs"."step_type" in ('SET_VALUE', 'TRANSFORM', 'CONDITION', 'AI_GENERATE', 'AGENT', 'APPROVAL', 'INTEGRATION_ACTION'));