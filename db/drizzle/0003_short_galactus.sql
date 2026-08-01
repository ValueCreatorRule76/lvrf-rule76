ALTER TABLE "heartbeat_events" ADD COLUMN "value_run_id" uuid;--> statement-breakpoint
CREATE INDEX "heartbeat_run_idx" ON "heartbeat_events" USING btree ("value_run_id");