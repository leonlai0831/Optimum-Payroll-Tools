-- Backfill the job role from the pay tier: A1/A2/A3 are front-desk staff, every
-- other tier (and an unset tier) is an instructor. One-time correction of
-- existing rows; new/edited coaches follow the same rule via jobRoleForTier().
UPDATE "coaches" SET "job_role" = 'front_desk' WHERE "allowance_tier" IN ('A1', 'A2', 'A3');
--> statement-breakpoint
UPDATE "coaches" SET "job_role" = 'instructor' WHERE "allowance_tier" IS NULL OR "allowance_tier" NOT IN ('A1', 'A2', 'A3');
