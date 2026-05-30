CREATE TABLE "allowance_period_locks" (
	"period_label" text PRIMARY KEY NOT NULL,
	"locked_by" text DEFAULT '' NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL
);
