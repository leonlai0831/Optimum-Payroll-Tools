CREATE TABLE "kpi_ingests" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_label" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"rows" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"imported_run_id" integer,
	"imported_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "kpi_ingests_status_idx" ON "kpi_ingests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kpi_ingests_received_idx" ON "kpi_ingests" USING btree ("received_at");