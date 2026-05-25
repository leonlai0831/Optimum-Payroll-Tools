CREATE TABLE "allowance_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allowance_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_label" text NOT NULL,
	"coach_id" integer,
	"canonical_name" text NOT NULL,
	"tier" text NOT NULL,
	"center" text DEFAULT '' NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "allowance_tier" text;