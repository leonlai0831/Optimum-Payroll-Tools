DROP INDEX "freelancer_runs_period_name_idx";--> statement-breakpoint
ALTER TABLE "freelancer_runs" ADD COLUMN "position_group" text;--> statement-breakpoint
ALTER TABLE "freelancer_runs" ADD COLUMN "work_period" text;--> statement-breakpoint
UPDATE "freelancer_runs" SET
  "position_group" = CASE
    WHEN ("input"->>'position') IN ('A1','A2','A3') THEN 'admin'
    WHEN ("input"->>'position') = 'CC' THEN 'cc'
    ELSE 'teaching'
  END,
  "work_period" = "period_label";--> statement-breakpoint
ALTER TABLE "freelancer_runs" ALTER COLUMN "position_group" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "freelancer_runs" ALTER COLUMN "work_period" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "freelancer_runs_period_name_group_work_idx" ON "freelancer_runs" USING btree ("period_label","canonical_name","position_group","work_period");