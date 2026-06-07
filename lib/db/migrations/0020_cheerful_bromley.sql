ALTER TABLE "assessments" ADD COLUMN "levels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "has_helper" boolean DEFAULT false NOT NULL;