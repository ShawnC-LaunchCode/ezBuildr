CREATE TYPE "anonymous_access_type" AS ENUM('disabled', 'unlimited', 'one_per_ip', 'one_per_session');--> statement-breakpoint
CREATE TYPE "condition_operator" AS ENUM('equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'between', 'is_empty', 'is_not_empty');--> statement-breakpoint
CREATE TYPE "conditional_action" AS ENUM('show', 'hide', 'require', 'make_optional');--> statement-breakpoint
CREATE TYPE "question_type" AS ENUM('short_text', 'long_text', 'multiple_choice', 'radio', 'yes_no', 'date_time', 'file_upload', 'loop_group');--> statement-breakpoint
CREATE TYPE "survey_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('admin', 'creator');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"page_id" uuid,
	"question_id" uuid,
	"event" varchar NOT NULL,
	"data" jsonb,
	"duration" integer,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anonymous_response_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"ip_address" varchar NOT NULL,
	"session_id" varchar,
	"response_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"subquestion_id" uuid,
	"loop_index" integer,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conditional_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"condition_question_id" uuid NOT NULL,
	"operator" "condition_operator" NOT NULL,
	"condition_value" jsonb NOT NULL,
	"target_question_id" uuid,
	"target_page_id" uuid,
	"action" "conditional_action" NOT NULL,
	"logical_operator" varchar DEFAULT 'AND',
	"order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer_id" uuid NOT NULL,
	"filename" varchar NOT NULL,
	"original_name" varchar NOT NULL,
	"mime_type" varchar NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "global_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"tags" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loop_group_subquestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loop_question_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"required" boolean DEFAULT false,
	"options" jsonb,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"required" boolean DEFAULT false,
	"options" jsonb,
	"loop_config" jsonb,
	"conditional_logic" jsonb,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"token" varchar NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "recipients_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"recipient_id" uuid,
	"completed" boolean DEFAULT false,
	"submitted_at" timestamp,
	"is_anonymous" boolean DEFAULT false,
	"ip_address" varchar,
	"user_agent" text,
	"session_id" varchar,
	"anonymous_metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"title" varchar NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"creator_id" varchar NOT NULL,
	"status" "survey_status" DEFAULT 'draft' NOT NULL,
	"allow_anonymous" boolean DEFAULT false,
	"anonymous_access_type" "anonymous_access_type" DEFAULT 'disabled',
	"public_link" varchar,
	"anonymous_config" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "surveys_public_link_unique" UNIQUE("public_link")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" "user_role" DEFAULT 'creator' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_page_id_survey_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "survey_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymous_response_tracking" ADD CONSTRAINT "anonymous_response_tracking_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymous_response_tracking" ADD CONSTRAINT "anonymous_response_tracking_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_subquestion_id_loop_group_subquestions_id_fk" FOREIGN KEY ("subquestion_id") REFERENCES "loop_group_subquestions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditional_rules" ADD CONSTRAINT "conditional_rules_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditional_rules" ADD CONSTRAINT "conditional_rules_condition_question_id_questions_id_fk" FOREIGN KEY ("condition_question_id") REFERENCES "questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditional_rules" ADD CONSTRAINT "conditional_rules_target_question_id_questions_id_fk" FOREIGN KEY ("target_question_id") REFERENCES "questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditional_rules" ADD CONSTRAINT "conditional_rules_target_page_id_survey_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "survey_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_recipients" ADD CONSTRAINT "global_recipients_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loop_group_subquestions" ADD CONSTRAINT "loop_group_subquestions_loop_question_id_questions_id_fk" FOREIGN KEY ("loop_question_id") REFERENCES "questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_page_id_survey_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "survey_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_pages" ADD CONSTRAINT "survey_pages_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_survey_event_idx" ON "analytics_events" USING btree ("survey_id","event");--> statement-breakpoint
CREATE INDEX "analytics_response_event_idx" ON "analytics_events" USING btree ("response_id","event");--> statement-breakpoint
CREATE INDEX "analytics_question_event_idx" ON "analytics_events" USING btree ("question_id","event");--> statement-breakpoint
CREATE INDEX "analytics_page_event_idx" ON "analytics_events" USING btree ("page_id","event");--> statement-breakpoint
CREATE INDEX "analytics_timestamp_idx" ON "analytics_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "analytics_duration_idx" ON "analytics_events" USING btree ("duration");--> statement-breakpoint
CREATE INDEX "analytics_survey_question_event_idx" ON "analytics_events" USING btree ("survey_id","question_id","event");--> statement-breakpoint
CREATE INDEX "analytics_survey_page_event_idx" ON "analytics_events" USING btree ("survey_id","page_id","event");--> statement-breakpoint
CREATE INDEX "anonymous_tracking_survey_ip_idx" ON "anonymous_response_tracking" USING btree ("survey_id","ip_address");--> statement-breakpoint
CREATE INDEX "anonymous_tracking_survey_session_idx" ON "anonymous_response_tracking" USING btree ("survey_id","session_id");--> statement-breakpoint
CREATE INDEX "global_recipients_creator_idx" ON "global_recipients" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "global_recipients_email_idx" ON "global_recipients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "global_recipients_creator_email_idx" ON "global_recipients" USING btree ("creator_id","email");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "surveys_public_link_unique_idx" ON "surveys" USING btree ("public_link");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid,
	"workflow_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
);