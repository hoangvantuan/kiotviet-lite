DROP INDEX "uniq_customers_store_phone_alive";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_customers_store_phone_alive" ON "customers" USING btree ("store_id","phone") WHERE "customers"."deleted_at" IS NULL AND "customers"."phone" IS NOT NULL;