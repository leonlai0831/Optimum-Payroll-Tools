CREATE TABLE "freelancer_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text DEFAULT '' NOT NULL,
	"end_time" text DEFAULT '' NOT NULL,
	"center" text NOT NULL,
	"class_type" text,
	"effective_from" text,
	"effective_to" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_id" integer NOT NULL,
	"period_label" text NOT NULL,
	"date" text NOT NULL,
	"center" text NOT NULL,
	"entry_type" text NOT NULL,
	"class_type" text,
	"start_time" text,
	"end_time" text,
	"hours" real NOT NULL,
	"slot_type" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_note" text DEFAULT '' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "freelancer_schedules_coach_idx" ON "freelancer_schedules" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "timesheets_coach_period_idx" ON "timesheets" USING btree ("coach_id","period_label");--> statement-breakpoint
CREATE INDEX "timesheets_status_idx" ON "timesheets" USING btree ("status");