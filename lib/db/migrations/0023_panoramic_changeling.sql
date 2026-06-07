-- Adds UNIQUE indexes on allowance_runs(period_label, canonical_name) and
-- coaches(canonical_name). Each CREATE UNIQUE INDEX is preceded by an idempotent
-- dedup (hand-added; drizzle does not generate these) so the auto-migration can't
-- fail on pre-existing duplicates. Every dedup statement is a no-op when there are
-- no duplicates, so the whole migration is safe to re-run.

-- [allowance_runs dedup] Keep the NEWEST row per (period_label, canonical_name):
-- delete every older row that shares the key with a higher id. No-op when unique.
DELETE FROM "allowance_runs" a
USING "allowance_runs" b
WHERE a.period_label = b.period_label
  AND a.canonical_name = b.canonical_name
  AND a.id < b.id;
--> statement-breakpoint
-- `allowance_runs_period_idx` (period_label only) is now redundant — the composite
-- unique index below leads with period_label and serves the same lookups.
DROP INDEX IF EXISTS "allowance_runs_period_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "allowance_runs_period_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "coaches_name_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "allowance_runs_period_name_idx" ON "allowance_runs" USING btree ("period_label","canonical_name");--> statement-breakpoint
-- [coaches dedup] Survivor per canonical_name = MIN(id). REPOINT every coach_id
-- reference to the survivor BEFORE deleting the duplicate coach rows, so nothing
-- is ever orphaned. The columns that point at coaches.id are: allowance_runs.coach_id,
-- users.coach_id, assessments.coach_id, notes.coach_id. We deliberately do NOT
-- merge the duplicates' aliases[] onto the survivor — the survivor keeps its own,
-- and the merge pass re-adds any missing accounts on the next upload.
-- Each UPDATE/DELETE is a no-op when canonical_name is already unique.
UPDATE "allowance_runs" r
SET coach_id = s.min_id
FROM (SELECT canonical_name, MIN(id) AS min_id FROM "coaches" GROUP BY canonical_name) s
JOIN "coaches" c ON c.canonical_name = s.canonical_name
WHERE r.coach_id = c.id AND r.coach_id <> s.min_id;
--> statement-breakpoint
UPDATE "users" r
SET coach_id = s.min_id
FROM (SELECT canonical_name, MIN(id) AS min_id FROM "coaches" GROUP BY canonical_name) s
JOIN "coaches" c ON c.canonical_name = s.canonical_name
WHERE r.coach_id = c.id AND r.coach_id <> s.min_id;
--> statement-breakpoint
UPDATE "assessments" r
SET coach_id = s.min_id
FROM (SELECT canonical_name, MIN(id) AS min_id FROM "coaches" GROUP BY canonical_name) s
JOIN "coaches" c ON c.canonical_name = s.canonical_name
WHERE r.coach_id = c.id AND r.coach_id <> s.min_id;
--> statement-breakpoint
UPDATE "notes" r
SET coach_id = s.min_id
FROM (SELECT canonical_name, MIN(id) AS min_id FROM "coaches" GROUP BY canonical_name) s
JOIN "coaches" c ON c.canonical_name = s.canonical_name
WHERE r.coach_id = c.id AND r.coach_id <> s.min_id;
--> statement-breakpoint
-- Now that every reference points at the survivor, delete the duplicate coaches.
DELETE FROM "coaches" c
USING (SELECT canonical_name, MIN(id) AS min_id FROM "coaches" GROUP BY canonical_name) s
WHERE c.canonical_name = s.canonical_name AND c.id <> s.min_id;
--> statement-breakpoint
CREATE UNIQUE INDEX "coaches_name_idx" ON "coaches" USING btree ("canonical_name");
