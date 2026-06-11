CREATE TABLE "freelancer_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "freelancer_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_label" text NOT NULL,
	"coach_id" integer,
	"canonical_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "ic_no" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "bank_account" text;--> statement-breakpoint
CREATE UNIQUE INDEX "freelancer_runs_period_name_idx" ON "freelancer_runs" USING btree ("period_label","canonical_name");--> statement-breakpoint
CREATE INDEX "freelancer_runs_coach_idx" ON "freelancer_runs" USING btree ("coach_id");