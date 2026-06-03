ALTER TABLE "coaches" ADD COLUMN "job_role" text DEFAULT 'instructor' NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "employment_type" text DEFAULT 'full_time' NOT NULL;