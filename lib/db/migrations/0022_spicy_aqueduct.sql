CREATE INDEX "assessments_coach_observed_idx" ON "assessments" USING btree ("coach_id","observed_on");--> statement-breakpoint
CREATE INDEX "audit_log_entity_action_created_idx" ON "audit_log" USING btree ("entity","action","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);