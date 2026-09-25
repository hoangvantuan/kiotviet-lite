ALTER TABLE "purchase_order_items" ADD COLUMN "unit_conversion_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "unit_name_snapshot" varchar(32);--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "conversion_factor" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "order_discount_allocated" bigint;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "unit_cost" bigint;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_unit_conversion_id_product_unit_conversions_id_fk" FOREIGN KEY ("unit_conversion_id") REFERENCES "public"."product_unit_conversions"("id") ON DELETE set null ON UPDATE no action;