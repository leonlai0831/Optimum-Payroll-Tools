CREATE TABLE "commission_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_label" text NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"sales_rows" jsonb NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
