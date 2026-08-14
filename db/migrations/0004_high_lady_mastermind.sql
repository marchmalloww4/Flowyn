CREATE TABLE "agent_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"type" text NOT NULL,
	"tool_name" text,
	"status" text NOT NULL,
	"safe_input_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"safe_output_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "agent_run_steps_type_check" CHECK ("agent_run_steps"."type" in ('MODEL_DECISION', 'TOOL_CALL', 'TOOL_RESULT', 'FINAL_RESPONSE', 'ERROR')),
	CONSTRAINT "agent_run_steps_status_check" CHECK ("agent_run_steps"."status" in ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid,
	"agent_name" text NOT NULL,
	"started_by" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"goal" text NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"final_response" text,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_status_check" CHECK ("agent_runs"."status" in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'MAX_STEPS_REACHED'))
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"system_instructions" text DEFAULT '' NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"max_steps" integer DEFAULT 5 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "agents_max_steps_check" CHECK ("agents"."max_steps" > 0 and "agents"."max_steps" <= 100)
);
--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_steps_run_idx" ON "agent_run_steps" USING btree ("run_id","step_number");--> statement-breakpoint
CREATE INDEX "agent_run_steps_workspace_idx" ON "agent_run_steps" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_created_idx" ON "agent_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_idx" ON "agent_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "agents_workspace_idx" ON "agents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agents_brand_idx" ON "agents" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "agents_workspace_name_idx" ON "agents" USING btree ("workspace_id","name");