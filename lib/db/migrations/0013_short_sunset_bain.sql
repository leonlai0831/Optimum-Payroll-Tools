CREATE TABLE "teaching_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_label" text NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"session_rows" jsonb NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
