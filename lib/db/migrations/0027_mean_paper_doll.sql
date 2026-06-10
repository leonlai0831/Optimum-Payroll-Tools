ALTER TABLE "users" ALTER COLUMN "visible_categories" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "visible_categories" DROP NOT NULL;--> statement-breakpoint
-- visible_categories becomes a per-user OVERRIDE: NULL = inherit the role's
-- default categories from the permission matrix. Rows holding all three
-- categories (any order; the old column default) are indistinguishable from
-- "never customized", so they reset to inherit; a proper subset is a real
-- override and stays.
UPDATE "users" SET "visible_categories" = NULL
WHERE "visible_categories" @> '["swim","fit","marketing"]'::jsonb;