CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_brands_store_name_alive" ON "brands" USING btree ("store_id",LOWER("name")) WHERE "brands"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_brands_store_created" ON "brands" USING btree ("store_id","created_at");