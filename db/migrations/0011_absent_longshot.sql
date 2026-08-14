CREATE TABLE "integration_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connector_id" text NOT NULL,
	"name" text NOT NULL,
	"encrypted_secret_material" text NOT NULL,
	"key_version" text NOT NULL,
	"secret_version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "integration_credentials_secret_version_check" CHECK ("integration_credentials"."secret_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credentials_workspace_name_idx" ON "integration_credentials" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "integration_credentials_workspace_idx" ON "integration_credentials" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "integration_credentials_active_idx" ON "integration_credentials" USING btree ("workspace_id","revoked_at","deleted_at");