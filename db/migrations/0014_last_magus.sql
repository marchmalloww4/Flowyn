CREATE TABLE "ai_generation_idempotency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation_key_hash" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"response_ciphertext" text,
	"response_key_version" text,
	"error_code" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_generation_idempotency_mode_check" CHECK ("ai_generation_idempotency"."mode" in ('SYNC', 'STREAM')),
	CONSTRAINT "ai_generation_idempotency_status_check" CHECK ("ai_generation_idempotency"."status" in ('IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'STREAM_COMPLETED')),
	CONSTRAINT "ai_generation_idempotency_response_version_check" CHECK (("ai_generation_idempotency"."response_ciphertext" is null and "ai_generation_idempotency"."response_key_version" is null) or ("ai_generation_idempotency"."response_ciphertext" is not null and "ai_generation_idempotency"."response_key_version" is not null)),
	CONSTRAINT "ai_generation_idempotency_completion_check" CHECK ("ai_generation_idempotency"."status" = 'IN_PROGRESS' or "ai_generation_idempotency"."completed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "ai_generation_idempotency" ADD CONSTRAINT "ai_generation_idempotency_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_generation_idempotency_workspace_operation_idx" ON "ai_generation_idempotency" USING btree ("workspace_id","operation_key_hash");--> statement-breakpoint
CREATE INDEX "ai_generation_idempotency_workspace_status_idx" ON "ai_generation_idempotency" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ai_generation_idempotency_expires_idx" ON "ai_generation_idempotency" USING btree ("expires_at");