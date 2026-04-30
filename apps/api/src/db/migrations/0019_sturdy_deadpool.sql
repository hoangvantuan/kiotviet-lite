CREATE TABLE "category_discounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"customer_id" uuid,
	"customer_group_id" uuid,
	"discount_type" varchar(16) NOT NULL,
	"discount_value" bigint NOT NULL,
	"min_qty" integer DEFAULT 1 NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_category_discount_target" CHECK (("category_discounts"."customer_id" IS NOT NULL)::int + ("category_discounts"."customer_group_id" IS NOT NULL)::int = 1),
	CONSTRAINT "check_category_discount_type_value" CHECK (("category_discounts"."discount_type" = 'percent' AND "category_discounts"."discount_value" <= 100) OR "category_discounts"."discount_type" = 'amount'),
	CONSTRAINT "check_category_discount_min_qty_positive" CHECK ("category_discounts"."min_qty" >= 1),
	CONSTRAINT "check_category_discount_dates_valid" CHECK ("category_discounts"."effective_to" IS NULL OR "category_discounts"."effective_from" IS NULL OR "category_discounts"."effective_to" >= "category_discounts"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "original_price" bigint;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "price_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "price_override_reason" varchar(255);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "price_override_pin_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category_discounts" ADD CONSTRAINT "category_discounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_discounts" ADD CONSTRAINT "category_discounts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_discounts" ADD CONSTRAINT "category_discounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_discounts" ADD CONSTRAINT "category_discounts_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_category_discounts_store_category" ON "category_discounts" USING btree ("store_id","category_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_category_discounts_store_customer" ON "category_discounts" USING btree ("store_id","customer_id") WHERE "category_discounts"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_category_discounts_store_group" ON "category_discounts" USING btree ("store_id","customer_group_id") WHERE "category_discounts"."customer_group_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_category_discounts_effective_window" ON "category_discounts" USING btree ("store_id","is_active","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "idx_order_items_price_override" ON "order_items" USING btree ("order_id","price_override") WHERE "order_items"."price_override" = true;