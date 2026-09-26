DROP INDEX "uniq_customer_prices_customer_product";--> statement-breakpoint
DROP INDEX "uniq_price_list_items_list_product";--> statement-breakpoint
DROP INDEX "uniq_volume_prices_product_min_qty";--> statement-breakpoint
ALTER TABLE "customer_prices" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "allow_negative_stock" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "volume_prices" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_prices" ADD CONSTRAINT "volume_prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "uniq_customer_prices_customer_product_variant" UNIQUE NULLS NOT DISTINCT("customer_id","product_id","variant_id");--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "uniq_price_list_items_list_product_variant" UNIQUE NULLS NOT DISTINCT("price_list_id","product_id","variant_id");--> statement-breakpoint
ALTER TABLE "volume_prices" ADD CONSTRAINT "uniq_volume_prices_product_variant_min_qty" UNIQUE NULLS NOT DISTINCT("product_id","variant_id","min_qty");