CREATE TABLE "workflow_approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"workflow_step_id" text NOT NULL,
	"workflow_name" text NOT NULL,
	"workflow_step_name" text NOT NULL,
	"workflow_version" integer NOT NULL,
	"required_role" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"safe_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"decision_reason" text,
	CONSTRAINT "workflow_approval_requests_role_check" CHECK ("workflow_approval_requests"."required_role" in ('OWNER', 'ADMIN')),
	CONSTRAINT "workflow_approval_requests_status_check" CHECK ("workflow_approval_requests"."status" in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
	CONSTRAINT "workflow_approval_requests_version_check" CHECK ("workflow_approval_requests"."workflow_version" > 0),
	CONSTRAINT "workflow_approval_requests_expiry_check" CHECK ("workflow_approval_requests"."expires_at" is null or "workflow_approval_requests"."expires_at" > "workflow_approval_requests"."created_at")
);
--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP CONSTRAINT "workflow_runs_status_check";--> statement-breakpoint
ALTER TABLE "workflow_step_runs" DROP CONSTRAINT "workflow_step_runs_status_check";--> statement-breakpoint
ALTER TABLE "workflow_step_runs" DROP CONSTRAINT "workflow_step_runs_step_type_check";--> statement-breakpoint
ALTER TABLE "workflow_run_dispatches" ADD COLUMN "dispatch_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_approval_requests" ADD CONSTRAINT "workflow_approval_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_requests" ADD CONSTRAINT "workflow_approval_requests_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_requests" ADD CONSTRAINT "workflow_approval_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_approval_requests_workspace_status_idx" ON "workflow_approval_requests" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "workflow_approval_requests_expires_idx" ON "workflow_approval_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_approval_requests_run_step_idx" ON "workflow_approval_requests" USING btree ("workflow_run_id","workflow_step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_workspace_id_idx" ON "workflow_runs" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "workflow_run_dispatches" ADD CONSTRAINT "workflow_run_dispatches_generation_check" CHECK ("workflow_run_dispatches"."dispatch_generation" >= 0);--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_status_check" CHECK ("workflow_runs"."status" in ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCEL_REQUESTED', 'CANCELLED', 'TIMED_OUT'));--> statement-breakpoint
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_status_check" CHECK ("workflow_step_runs"."status" in ('RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED'));--> statement-breakpoint
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_step_type_check" CHECK ("workflow_step_runs"."step_type" in ('SET_VALUE', 'TRANSFORM', 'CONDITION', 'AI_GENERATE', 'AGENT', 'APPROVAL'));