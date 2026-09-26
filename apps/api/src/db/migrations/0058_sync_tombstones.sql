CREATE TABLE "sync_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_sync_tombstones_store_deleted" ON "sync_tombstones" USING btree ("store_id","deleted_at","id");