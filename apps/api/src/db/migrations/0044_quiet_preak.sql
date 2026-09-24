ALTER TABLE "orders" ADD COLUMN "price_list_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "price_list_name" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_orders_store_price_list" ON "orders" USING btree ("store_id","price_list_id");