CREATE TABLE "bulk_import_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"mode" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"total_rows" integer NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"succeeded_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"error_message" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chk_bulk_import_jobs_type" CHECK ("bulk_import_jobs"."type" IN ('product', 'customer', 'supplier')),
	CONSTRAINT "chk_bulk_import_jobs_mode" CHECK ("bulk_import_jobs"."mode" IN ('create-only', 'upsert')),
	CONSTRAINT "chk_bulk_import_jobs_status" CHECK ("bulk_import_jobs"."status" IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "chk_bulk_import_jobs_counts" CHECK ("bulk_import_jobs"."file_size_bytes" > 0 AND "bulk_import_jobs"."total_rows" BETWEEN 0 AND 100000 AND "bulk_import_jobs"."processed_rows" >= 0 AND "bulk_import_jobs"."succeeded_rows" >= 0 AND "bulk_import_jobs"."failed_rows" >= 0 AND "bulk_import_jobs"."succeeded_rows" + "bulk_import_jobs"."failed_rows" <= "bulk_import_jobs"."processed_rows" AND "bulk_import_jobs"."processed_rows" <= "bulk_import_jobs"."total_rows")
);
--> statement-breakpoint
ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "bulk_import_jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "bulk_import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_bulk_import_jobs_active_store_type" ON "bulk_import_jobs" USING btree ("store_id","type") WHERE "bulk_import_jobs"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "idx_bulk_import_jobs_store_created" ON "bulk_import_jobs" USING btree ("store_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_bulk_import_jobs_expires" ON "bulk_import_jobs" USING btree ("expires_at");