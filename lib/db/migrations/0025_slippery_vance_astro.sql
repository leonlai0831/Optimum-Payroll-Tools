CREATE TABLE "lesson_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_by_name" text DEFAULT '' NOT NULL,
	"coach_id" integer,
	"instructor_name" text NOT NULL,
	"actual_instructor_name" text DEFAULT '' NOT NULL,
	"center" text DEFAULT '' NOT NULL,
	"lesson_date" timestamp with time zone NOT NULL,
	"time_label" text DEFAULT '' NOT NULL,
	"level_type" text,
	"class_level" text DEFAULT '' NOT NULL,
	"age_group" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"review_note" text DEFAULT '' NOT NULL,
	"reviewed_by_email" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lesson_plans_creator_idx" ON "lesson_plans" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "lesson_plans_status_idx" ON "lesson_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lesson_plans_date_idx" ON "lesson_plans" USING btree ("lesson_date");