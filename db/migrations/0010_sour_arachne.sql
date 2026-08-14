CREATE TABLE "workflow_editor_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version_id" uuid NOT NULL,
	"layout" jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_editor_layouts" ADD CONSTRAINT "workflow_editor_layouts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_editor_layouts" ADD CONSTRAINT "workflow_editor_layouts_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_editor_layouts" ADD CONSTRAINT "workflow_editor_layouts_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_editor_layouts" ADD CONSTRAINT "workflow_editor_layouts_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_editor_layouts_workflow_idx" ON "workflow_editor_layouts" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_editor_layouts_workspace_idx" ON "workflow_editor_layouts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workflow_editor_layouts_version_idx" ON "workflow_editor_layouts" USING btree ("workflow_version_id");