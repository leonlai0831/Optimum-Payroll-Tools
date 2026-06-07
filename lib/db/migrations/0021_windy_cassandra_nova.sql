CREATE INDEX "allowance_runs_period_idx" ON "allowance_runs" USING btree ("period_label");--> statement-breakpoint
CREATE INDEX "allowance_runs_period_name_idx" ON "allowance_runs" USING btree ("period_label","canonical_name");--> statement-breakpoint
CREATE INDEX "allowance_runs_coach_idx" ON "allowance_runs" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "assessments_coach_idx" ON "assessments" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "coaches_name_idx" ON "coaches" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "commission_runs_period_idx" ON "commission_runs" USING btree ("period_label");--> statement-breakpoint
CREATE INDEX "gym_staff_name_idx" ON "gym_staff" USING btree ("name");--> statement-breakpoint
CREATE INDEX "runs_created_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "teaching_runs_period_idx" ON "teaching_runs" USING btree ("period_label");