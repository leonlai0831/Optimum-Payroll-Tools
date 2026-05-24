CREATE TABLE "coaches" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"center" text DEFAULT '' NOT NULL,
	"default_position" text DEFAULT 'Instructor' NOT NULL,
	"last_mgmt_assessment" real,
	"last_mgmt_assessment_at" timestamp with time zone,
	"last_allowance" real,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_label" text NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'finalized' NOT NULL,
	"csv_rows" jsonb NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"coach_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
