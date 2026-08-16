DROP INDEX "idx_categories_store_parent_sort";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "client_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_categories_store_parent_sort" ON "categories" USING btree ("store_id","parent_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_return_items_return_order_item" ON "order_return_items" USING btree ("return_id","order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_orders_store_client" ON "orders" USING btree ("store_id","client_id");