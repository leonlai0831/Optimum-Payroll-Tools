CREATE TABLE "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_id" integer NOT NULL,
	"observed_on" timestamp with time zone DEFAULT now() NOT NULL,
	"assessor" text DEFAULT '' NOT NULL,
	"class_type" text DEFAULT '' NOT NULL,
	"pool_type" text DEFAULT '' NOT NULL,
	"pax" integer,
	"ratings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_percent" real NOT NULL,
	"final_grade" text NOT NULL,
	"comments" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
