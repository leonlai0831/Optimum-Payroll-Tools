CREATE TABLE "app_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"path" text,
	"user_id" integer,
	"user_email" text DEFAULT '' NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "app_errors_created_idx" ON "app_errors" USING btree ("created_at" DESC NULLS LAST);