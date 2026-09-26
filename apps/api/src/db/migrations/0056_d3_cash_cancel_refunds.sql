ALTER TABLE "orders" ADD COLUMN "cancel_refund_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- BC-06: đơn đã hủy trước thay đổi này: tiền trả lại khách = phần khách đã trả lúc bán (tổng trừ
-- khoản nợ của đơn), như order-cancel.service. Kênh trả không rõ nên để NULL ("Chưa rõ").
UPDATE "orders" AS o
SET "cancel_refund_amount" = o."total" - coalesce(d."amount", 0)
FROM "orders" AS src
LEFT JOIN "debts" AS d ON d."order_id" = src."id"
WHERE o."id" = src."id" AND o."status" = 'cancelled';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_refund_method" varchar(16);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_shift_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "cancel_refund_method" varchar(16);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "cancel_shift_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "refund_method" varchar(16);--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancel_shift_id_cash_shifts_id_fk" FOREIGN KEY ("cancel_shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancel_shift_id_cash_shifts_id_fk" FOREIGN KEY ("cancel_shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_orders_cancel_shift" ON "orders" USING btree ("cancel_shift_id");--> statement-breakpoint
CREATE INDEX "idx_orders_store_cancelled_at" ON "orders" USING btree ("store_id","cancelled_at");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_cancel_shift" ON "purchase_orders" USING btree ("cancel_shift_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_store_cancelled_at" ON "purchase_orders" USING btree ("store_id","cancelled_at");--> statement-breakpoint
CREATE INDEX "idx_purchase_returns_shift" ON "purchase_returns" USING btree ("shift_id");