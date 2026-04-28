CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" varchar(64) NOT NULL,
	"barcode" varchar(64),
	"attribute1_name" varchar(50) NOT NULL,
	"attribute1_value" varchar(50) NOT NULL,
	"attribute2_name" varchar(50),
	"attribute2_value" varchar(50),
	"selling_price" bigint DEFAULT 0 NOT NULL,
	"cost_price" bigint,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_variants_store_sku_alive" ON "product_variants" USING btree ("store_id",LOWER("sku")) WHERE "product_variants"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_variants_store_barcode_alive" ON "product_variants" USING btree ("store_id","barcode") WHERE "product_variants"."deleted_at" IS NULL AND "product_variants"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_variants_product_attrs_alive" ON "product_variants" USING btree ("product_id",LOWER("attribute1_value"),LOWER(coalesce("attribute2_value", ''))) WHERE "product_variants"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_variants_product_created" ON "product_variants" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_variants_store_status" ON "product_variants" USING btree ("store_id","status");--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_variant_created" ON "inventory_transactions" USING btree ("variant_id","created_at");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "ck_variants_attr2_consistency" CHECK (
  ("attribute2_name" IS NULL AND "attribute2_value" IS NULL)
  OR ("attribute2_name" IS NOT NULL AND "attribute2_value" IS NOT NULL)
);