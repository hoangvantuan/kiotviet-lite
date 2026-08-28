CREATE INDEX "idx_debts_store_remaining_created" ON "debts" USING btree ("store_id","created_at") WHERE "debts"."remaining" > 0;--> statement-breakpoint
CREATE INDEX "idx_inventory_tx_store_product_date" ON "inventory_transactions" USING btree ("store_id","product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_orders_store_status_created" ON "orders" USING btree ("store_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_orders_store_cust_status_date" ON "orders" USING btree ("store_id","customer_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_orders_store_user_status_date" ON "orders" USING btree ("store_id","user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_store_created" ON "purchase_orders" USING btree ("store_id","created_at" DESC NULLS LAST);