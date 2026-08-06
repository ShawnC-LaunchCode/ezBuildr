ALTER TYPE "public"."signature_event_type" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."signature_event_type" ADD VALUE 'voided';--> statement-breakpoint
ALTER TYPE "public"."signature_event_type" ADD VALUE 'expired';--> statement-breakpoint
ALTER TYPE "public"."signature_request_status" ADD VALUE 'voided';