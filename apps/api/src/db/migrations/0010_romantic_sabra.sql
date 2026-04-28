CREATE TABLE "product_unit_conversions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit" varchar(32) NOT NULL,
	"conversion_factor" integer NOT NULL,
	"selling_price" bigint DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "unit_cost" bigint;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "cost_after" bigint;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "stock_after" integer;--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_unit_conversions_product_unit" ON "product_unit_conversions" USING btree ("product_id",LOWER("unit"));--> statement-breakpoint
CREATE INDEX "idx_unit_conversions_product_sort" ON "product_unit_conversions" USING btree ("product_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_store_created" ON "inventory_transactions" USING btree ("store_id","created_at");--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "ck_unit_conversions_factor_positive" CHECK ("conversion_factor" > 1);--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "ck_unit_conversions_price_nonneg" CHECK ("selling_price" >= 0);