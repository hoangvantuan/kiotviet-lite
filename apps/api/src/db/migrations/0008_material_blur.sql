CREATE TABLE "inventory_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"quantity" integer NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(64) NOT NULL,
	"barcode" varchar(64),
	"category_id" uuid,
	"selling_price" bigint DEFAULT 0 NOT NULL,
	"cost_price" bigint,
	"unit" varchar(32) DEFAULT 'Cái' NOT NULL,
	"image_url" text,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"has_variants" boolean DEFAULT false NOT NULL,
	"track_inventory" boolean DEFAULT false NOT NULL,
	"current_stock" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_product_created" ON "inventory_transactions" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_products_store_sku_alive" ON "products" USING btree ("store_id",LOWER("sku")) WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_products_store_barcode_alive" ON "products" USING btree ("store_id","barcode") WHERE "products"."deleted_at" IS NULL AND "products"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_products_store_status_created" ON "products" USING btree ("store_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_products_store_category" ON "products" USING btree ("store_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_products_store_name_lower" ON "products" USING btree ("store_id",LOWER("name"));