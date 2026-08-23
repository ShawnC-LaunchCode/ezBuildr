ALTER TYPE "logic_rule_target_type" RENAME VALUE 'section' TO 'page';--> statement-breakpoint
ALTER TYPE "block_phase" RENAME VALUE 'onSectionEnter' TO 'onPageEnter';--> statement-breakpoint
ALTER TYPE "block_phase" RENAME VALUE 'onSectionSubmit' TO 'onPageSubmit';
