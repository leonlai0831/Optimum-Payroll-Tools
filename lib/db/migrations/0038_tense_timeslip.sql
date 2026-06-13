-- One workforce profile ↔ one login. Before adding the partial UNIQUE indexes,
-- dedup any historical duplicates (a coach / gym-staff record linked to more
-- than one account, possible before the link-uniqueness guard landed): per
-- profile KEEP the best login — the ACTIVE one, then the earliest (lowest id) —
-- and NULL the rest. Preferring active avoids orphaning the live operator in
-- favour of a stale/deactivated account. Auto-applied on cold start, so it must
-- leave the DB index-ready. Re-run safe (idempotent): after the first pass there
-- are no duplicates, so the audit insert and the UPDATEs no-op.

-- Audit a single summary row IF (and only if) duplicates exist — run BEFORE the
-- UPDATEs so the EXISTS checks can still see them. actor_id NULL = system.
INSERT INTO "audit_log" ("actor_email", "action", "entity", "summary")
SELECT 'system', 'user.dedup_links', 'user',
  'Auto-dedup before the user link UNIQUE index: nulled duplicate coach / gym-staff links, kept the ACTIVE login per profile (else the earliest). Re-run AI auto-link to re-attach any orphaned account.'
WHERE EXISTS (
  SELECT 1 FROM "users" WHERE "coach_id" IS NOT NULL GROUP BY "coach_id" HAVING count(*) > 1
) OR EXISTS (
  SELECT 1 FROM "users" WHERE "gym_staff_id" IS NOT NULL GROUP BY "gym_staff_id" HAVING count(*) > 1
);--> statement-breakpoint
UPDATE "users" SET "coach_id" = NULL
WHERE "coach_id" IS NOT NULL
  AND "id" NOT IN (
    SELECT DISTINCT ON ("coach_id") "id" FROM "users"
    WHERE "coach_id" IS NOT NULL
    ORDER BY "coach_id", "active" DESC, "id" ASC
  );--> statement-breakpoint
UPDATE "users" SET "gym_staff_id" = NULL
WHERE "gym_staff_id" IS NOT NULL
  AND "id" NOT IN (
    SELECT DISTINCT ON ("gym_staff_id") "id" FROM "users"
    WHERE "gym_staff_id" IS NOT NULL
    ORDER BY "gym_staff_id", "active" DESC, "id" ASC
  );--> statement-breakpoint
CREATE UNIQUE INDEX "users_coach_id_unique" ON "users" USING btree ("coach_id") WHERE "users"."coach_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_gym_staff_id_unique" ON "users" USING btree ("gym_staff_id") WHERE "users"."gym_staff_id" is not null;
