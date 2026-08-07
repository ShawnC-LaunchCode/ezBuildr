ALTER TABLE "logic_rules" ALTER COLUMN "operator" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "logic_rules" ADD COLUMN "when" jsonb;