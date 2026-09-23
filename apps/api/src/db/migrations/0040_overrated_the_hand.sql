ALTER TABLE "customers" ADD COLUMN "code" varchar(64);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "customer_code_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "supplier_code_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "code" varchar(64);--> statement-breakpoint
UPDATE "customers" AS c SET "code" = 'KH' || lpad(numbered.seq::text, greatest(6, length(numbered.seq::text)), '0')
FROM (SELECT "id", row_number() OVER (PARTITION BY "store_id" ORDER BY "created_at", "id") AS seq FROM "customers") AS numbered
WHERE c."id" = numbered."id";--> statement-breakpoint
UPDATE "suppliers" AS s SET "code" = 'NCC' || lpad(numbered.seq::text, greatest(6, length(numbered.seq::text)), '0')
FROM (SELECT "id", row_number() OVER (PARTITION BY "store_id" ORDER BY "created_at", "id") AS seq FROM "suppliers") AS numbered
WHERE s."id" = numbered."id";--> statement-breakpoint
UPDATE "stores" AS s SET "customer_code_counter" = (SELECT count(*) FROM "customers" WHERE "store_id" = s."id"),
  "supplier_code_counter" = (SELECT count(*) FROM "suppliers" WHERE "store_id" = s."id");--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_customers_store_code_alive" ON "customers" USING btree ("store_id",LOWER("code")) WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_suppliers_store_code_alive" ON "suppliers" USING btree ("store_id",LOWER("code")) WHERE "suppliers"."deleted_at" IS NULL;