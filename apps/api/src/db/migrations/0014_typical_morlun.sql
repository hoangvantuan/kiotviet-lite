CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_name_snapshot" varchar(255) NOT NULL,
	"product_sku_snapshot" varchar(64) NOT NULL,
	"variant_label_snapshot" varchar(255),
	"quantity" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"discount_type" varchar(16) DEFAULT 'amount' NOT NULL,
	"discount_value" bigint DEFAULT 0 NOT NULL,
	"line_total" bigint NOT NULL,
	"cost_after" bigint,
	"stock_after" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount_total" bigint DEFAULT 0 NOT NULL,
	"discount_total_type" varchar(16) DEFAULT 'amount' NOT NULL,
	"discount_total_value" bigint DEFAULT 0 NOT NULL,
	"total_amount" bigint NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"payment_status" varchar(16) NOT NULL,
	"note" text,
	"purchase_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"address" text,
	"tax_id" varchar(32),
	"notes" text,
	"current_debt" bigint DEFAULT 0 NOT NULL,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"total_purchased" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_po" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_product" ON "purchase_order_items" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_variant" ON "purchase_order_items" USING btree ("variant_id","created_at") WHERE "purchase_order_items"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_purchase_orders_store_code" ON "purchase_orders" USING btree ("store_id","code");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_store_date" ON "purchase_orders" USING btree ("store_id","purchase_date");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_store_supplier" ON "purchase_orders" USING btree ("store_id","supplier_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_store_payment_status" ON "purchase_orders" USING btree ("store_id","payment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_suppliers_store_name_alive" ON "suppliers" USING btree ("store_id",LOWER("name")) WHERE "suppliers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_suppliers_store_phone_alive" ON "suppliers" USING btree ("store_id","phone") WHERE "suppliers"."deleted_at" IS NULL AND "suppliers"."phone" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_suppliers_store_created" ON "suppliers" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_suppliers_store_name_lower" ON "suppliers" USING btree ("store_id",LOWER("name"));--> statement-breakpoint
CREATE INDEX "idx_suppliers_store_phone" ON "suppliers" USING btree ("store_id","phone");