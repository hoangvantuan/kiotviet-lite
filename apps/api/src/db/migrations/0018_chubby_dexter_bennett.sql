DROP INDEX "idx_stock_check_items_product";--> statement-breakpoint
DROP INDEX "idx_stock_check_logs_store_adjusted";--> statement-breakpoint
DROP INDEX "idx_stock_check_logs_product_adjusted";--> statement-breakpoint
DROP INDEX "idx_stock_checks_store_created";--> statement-breakpoint
CREATE INDEX "idx_stock_check_items_product" ON "stock_check_items" USING btree ("product_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_stock_check_logs_store_adjusted" ON "stock_check_logs" USING btree ("store_id","adjusted_at" desc);--> statement-breakpoint
CREATE INDEX "idx_stock_check_logs_product_adjusted" ON "stock_check_logs" USING btree ("product_id","adjusted_at" desc);--> statement-breakpoint
CREATE INDEX "idx_stock_checks_store_created" ON "stock_checks" USING btree ("store_id","created_at" desc);