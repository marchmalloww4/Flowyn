CREATE TABLE "generation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"input_chars" integer NOT NULL,
	"output_chars" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_logs_status_check" CHECK ("generation_logs"."status" in ('SUCCEEDED', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "generation_logs" ADD CONSTRAINT "generation_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_logs" ADD CONSTRAINT "generation_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_logs_workspace_created_idx" ON "generation_logs" USING btree ("workspace_id","created_at");