-- kpi_ingests.source: how the delivery arrived ('api' bearer push | 'manual'
-- /progress/upload). Hand-edited from the generated single ADD COLUMN NOT NULL
-- so it is safe on a non-empty table (same pattern as migration 0031): add
-- nullable, backfill — every pre-existing row was a machine push — then tighten.
ALTER TABLE "kpi_ingests" ADD COLUMN "source" text;--> statement-breakpoint
UPDATE "kpi_ingests" SET "source" = 'api';--> statement-breakpoint
ALTER TABLE "kpi_ingests" ALTER COLUMN "source" SET NOT NULL;
