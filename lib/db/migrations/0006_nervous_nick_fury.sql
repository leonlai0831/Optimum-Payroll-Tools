CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_id" integer NOT NULL,
	"note_date" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text DEFAULT 'general' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"severity" text,
	"follow_up" boolean DEFAULT false NOT NULL,
	"authored_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
