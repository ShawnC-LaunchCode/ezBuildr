ALTER TABLE "sections" RENAME TO "pages";--> statement-breakpoint
ALTER TABLE "blocks" RENAME COLUMN "section_id" TO "page_id";--> statement-breakpoint
ALTER TABLE "lifecycle_hooks" RENAME COLUMN "section_id" TO "page_id";--> statement-breakpoint
ALTER TABLE "logic_rules" RENAME COLUMN "target_section_id" TO "target_page_id";--> statement-breakpoint
ALTER TABLE "steps" RENAME COLUMN "section_id" TO "page_id";--> statement-breakpoint
ALTER TABLE "transform_blocks" RENAME COLUMN "section_id" TO "page_id";--> statement-breakpoint
ALTER TABLE "ai_workflow_feedback" RENAME COLUMN "generated_sections" TO "generated_pages";--> statement-breakpoint
ALTER TABLE "workflow_runs" RENAME COLUMN "current_section_id" TO "current_page_id";--> statement-breakpoint
ALTER TABLE "pages" RENAME CONSTRAINT "sections_pkey" TO "pages_pkey";--> statement-breakpoint
ALTER TABLE "pages" RENAME CONSTRAINT "sections_workflow_id_workflows_id_fk" TO "pages_workflow_id_workflows_id_fk";--> statement-breakpoint
ALTER TABLE "blocks" RENAME CONSTRAINT "blocks_section_id_sections_id_fk" TO "blocks_page_id_pages_id_fk";--> statement-breakpoint
ALTER TABLE "lifecycle_hooks" RENAME CONSTRAINT "lifecycle_hooks_section_id_sections_id_fk" TO "lifecycle_hooks_page_id_pages_id_fk";--> statement-breakpoint
ALTER TABLE "logic_rules" RENAME CONSTRAINT "logic_rules_target_section_id_sections_id_fk" TO "logic_rules_target_page_id_pages_id_fk";--> statement-breakpoint
ALTER TABLE "steps" RENAME CONSTRAINT "steps_section_id_sections_id_fk" TO "steps_page_id_pages_id_fk";--> statement-breakpoint
ALTER TABLE "transform_blocks" RENAME CONSTRAINT "transform_blocks_section_id_sections_id_fk" TO "transform_blocks_page_id_pages_id_fk";--> statement-breakpoint
ALTER TABLE "workflow_runs" RENAME CONSTRAINT "workflow_runs_current_section_id_sections_id_fk" TO "workflow_runs_current_page_id_pages_id_fk";--> statement-breakpoint
ALTER INDEX "sections_workflow_idx" RENAME TO "pages_workflow_idx";--> statement-breakpoint
ALTER INDEX "sections_deleted_at_idx" RENAME TO "pages_deleted_at_idx";--> statement-breakpoint
ALTER INDEX "steps_section_idx" RENAME TO "steps_page_idx";--> statement-breakpoint
ALTER INDEX "workflow_runs_current_section_idx" RENAME TO "workflow_runs_current_page_idx";
