CREATE TABLE "appraisals" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_id" integer NOT NULL,
	"period_label" text DEFAULT '' NOT NULL,
	"review_date" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text DEFAULT '' NOT NULL,
	"ratings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"overall_score" real NOT NULL,
	"comments" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
