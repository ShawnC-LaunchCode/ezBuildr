ALTER TABLE "steps" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."step_type";--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('text', 'boolean', 'phone', 'date_time', 'choice', 'email', 'number', 'scale', 'website', 'address', 'multi_field', 'display', 'file_upload', 'list', 'js_question', 'computed', 'final_documents', 'signature_block');--> statement-breakpoint
ALTER TABLE "steps" ALTER COLUMN "type" SET DATA TYPE "public"."step_type" USING "type"::"public"."step_type";