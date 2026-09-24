ALTER TABLE "bulk_import_jobs" ADD COLUMN "confirmed_digest" varchar(64);--> statement-breakpoint
UPDATE "bulk_import_jobs" SET "confirmed_digest" = repeat('0', 64), "status" = 'failed', "error_message" = 'Tác vụ cũ không có mã xác nhận; vui lòng nhập lại', "finished_at" = now(), "updated_at" = now() WHERE "status" IN ('queued', 'running');--> statement-breakpoint
UPDATE "bulk_import_jobs" SET "confirmed_digest" = repeat('0', 64) WHERE "confirmed_digest" IS NULL;--> statement-breakpoint
ALTER TABLE "bulk_import_jobs" ALTER COLUMN "confirmed_digest" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bulk_import_jobs" ADD COLUMN "approve_new_names" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "chk_bulk_import_jobs_digest" CHECK ("bulk_import_jobs"."confirmed_digest" ~ '^[0-9a-f]{64}$');