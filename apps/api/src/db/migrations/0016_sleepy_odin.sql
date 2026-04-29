CREATE TABLE "customer_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volume_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"min_qty" integer NOT NULL,
	"price" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_volume_prices_min_qty_positive" CHECK ("volume_prices"."min_qty" >= 1)
);
--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_prices" ADD CONSTRAINT "volume_prices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_prices" ADD CONSTRAINT "volume_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_customer_prices_customer_product" ON "customer_prices" USING btree ("customer_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_customer_prices_store_customer" ON "customer_prices" USING btree ("store_id","customer_id");--> statement-breakpoint
CREATE INDEX "idx_customer_prices_product" ON "customer_prices" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_volume_prices_product_min_qty" ON "volume_prices" USING btree ("product_id","min_qty");--> statement-breakpoint
CREATE INDEX "idx_volume_prices_product" ON "volume_prices" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_volume_prices_store_product" ON "volume_prices" USING btree ("store_id","product_id");