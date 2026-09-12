CREATE TABLE "admin_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" varchar,
	"action" varchar NOT NULL,
	"target_tenant_id" uuid,
	"target_user_id" varchar,
	"request_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_access_log_actor_idx" ON "admin_access_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "admin_access_log_target_tenant_idx" ON "admin_access_log" USING btree ("target_tenant_id");--> statement-breakpoint
CREATE INDEX "admin_access_log_created_idx" ON "admin_access_log" USING btree ("created_at");