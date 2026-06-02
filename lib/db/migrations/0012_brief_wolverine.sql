CREATE TABLE "gym_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"staff_code" text DEFAULT '' NOT NULL,
	"position" text DEFAULT 'personal_trainer' NOT NULL,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
