ALTER TABLE "customers" DROP CONSTRAINT "customers_group_id_customer_groups_id_fk";
--> statement-breakpoint
DROP INDEX "uniq_customer_groups_store_name";--> statement-breakpoint
DROP INDEX "idx_customer_groups_store";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "name" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "tax_id" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "customer_groups" ADD COLUMN "description" varchar(255);--> statement-breakpoint
ALTER TABLE "customer_groups" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_customer_groups_store_name_alive" ON "customer_groups" USING btree ("store_id",LOWER("name")) WHERE "customer_groups"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_customer_groups_store_created" ON "customer_groups" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_customers_store_created" ON "customers" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_customers_store_phone" ON "customers" USING btree ("store_id","phone");