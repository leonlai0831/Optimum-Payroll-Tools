-- Default-deny launcher categories (Backlog G). Historically every role
-- defaulted to ALL THREE launcher categories (swim / fit / marketing), so every
-- account saw every department until an admin tightened it. Flip the default to
-- NOTHING: a new account sees no department until an admin grants one on the
-- Permissions "Per-account access" tab. To keep EXISTING accounts' access, FIRST
-- snapshot each inheriting account's CURRENT effective categories into an
-- explicit per-user override, THEN flip the stored role defaults to []. Only
-- brand-new accounts (created after this) default-deny.
--
-- Auto-applied on cold start; must be safe on the non-transactional
-- reconcile-replay path (lib/db/index.ts reconcileSchema replays statements one
-- at a time), so:
--   * The snapshot + flip are ONE atomic statement (a data-modifying CTE). Both
--     parts see the SAME snapshot, so the CTE reads the PRE-flip role defaults
--     even though the same statement flips them — step1 can never observe a
--     half-applied step2 and over-grant a new account to all three.
--   * The CTE only touches rows with NULL visible_categories (inheriting); once
--     snapshotted they are non-NULL, so a replay can't overwrite them. A NULL row
--     created AFTER the flip reads the now-[] default → COALESCE keeps [] (deny).
--   * The audit row is inserted at most once (guarded by NOT EXISTS on its
--     action), so a replay can't pollute the log with phantom system actions.
--   * super_admin is excluded (always sees every category; a stored list is
--     rejected by the API and ignored by effectiveCategories).
-- On a brand-new deploy there is no config row / no non-super-admin users yet at
-- migration time, so every statement no-ops and the new [] default seeds from code.

-- Audit one summary row, ONCE (actor_email 'system', actor_id NULL), only on an
-- existing deployment (a saved config row exists).
INSERT INTO "audit_log" ("actor_email", "action", "entity", "summary")
SELECT 'system', 'permissions.default_deny_categories', 'permission_config',
  'Default-deny launcher categories: snapshotted each inheriting account''s current categories into a per-user override, then flipped the role defaults to none. Existing accounts keep their access; new accounts see no department until granted.'
WHERE EXISTS (SELECT 1 FROM "permission_config" WHERE "id" = 1)
  AND NOT EXISTS (
    SELECT 1 FROM "audit_log" WHERE "action" = 'permissions.default_deny_categories'
  );--> statement-breakpoint
-- Step 1 (snapshot) + Step 2 (flip) as ONE atomic statement. The CTE pins each
-- inheriting (NULL) non-super-admin account's CURRENT effective categories — the
-- role default from the stored config, or ALL THREE when there is no config row /
-- categories key (the historical fallback). The main UPDATE then flips the stored
-- role defaults to none; both read the same snapshot, so the CTE sees the old
-- defaults regardless of the flip.
WITH "snapshot" AS (
  UPDATE "users" u
  SET "visible_categories" = COALESCE(
    (SELECT pc."data" -> 'categories' -> (u."role") FROM "permission_config" pc WHERE pc."id" = 1),
    '["swim","fit","marketing"]'::jsonb
  )
  WHERE u."visible_categories" IS NULL
    AND u."role" IN ('admin', 'supervisor', 'staff')
  RETURNING u."id"
)
UPDATE "permission_config"
SET "data" = jsonb_set("data", '{categories}', '{"admin":[],"supervisor":[],"staff":[]}'::jsonb, true),
    "updated_at" = now()
WHERE "id" = 1;
