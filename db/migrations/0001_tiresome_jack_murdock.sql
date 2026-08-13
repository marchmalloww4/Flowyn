ALTER TABLE "workspace_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER';--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_created_idx" ON "audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "brand_examples_brand_idx" ON "brand_examples" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_rules_brand_idx" ON "brand_rules" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brands_workspace_idx" ON "brands" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
UPDATE "workspace_members" SET "role" = upper("role") WHERE "role" IN ('owner', 'admin', 'member');--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_check" CHECK ("workspace_members"."role" in ('OWNER', 'ADMIN', 'MEMBER'));
