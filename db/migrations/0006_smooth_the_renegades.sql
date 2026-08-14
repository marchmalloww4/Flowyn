ALTER TABLE "workflow_step_runs" ADD COLUMN "execution_token" text;
--> statement-breakpoint
UPDATE "workflow_step_runs" SET "execution_token" = gen_random_uuid()::text WHERE "execution_token" IS NULL;
--> statement-breakpoint
ALTER TABLE "workflow_step_runs" ALTER COLUMN "execution_token" SET NOT NULL;
