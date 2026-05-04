CREATE TABLE "order_return_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"return_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_name" varchar(255) NOT NULL,
	"variant_name" varchar(255),
	"unit" varchar(50),
	"unit_price" bigint NOT NULL,
	"quantity" bigint NOT NULL,
	"line_total" bigint NOT NULL,
	"reason" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"return_number" varchar(32) NOT NULL,
	"total_amount" bigint NOT NULL,
	"refund_amount" bigint DEFAULT 0 NOT NULL,
	"debt_reduction_amount" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_return_id_order_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_items" ADD CONSTRAINT "order_return_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_return_items_return" ON "order_return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "idx_return_items_order_item" ON "order_return_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_order_returns_store_number" ON "order_returns" USING btree ("store_id","return_number");--> statement-breakpoint
CREATE INDEX "idx_order_returns_order" ON "order_returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_returns_store_date" ON "order_returns" USING btree ("store_id","created_at");