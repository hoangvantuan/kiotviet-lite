-- BM-02: khóa ngoại ghép (store_id, id) để đơn không thể tham chiếu khách hoặc bảng giá của cửa hàng khác.
-- Unique index phải có trước khi tạo khóa ngoại trỏ tới nó.
CREATE UNIQUE INDEX "uniq_customers_store_id" ON "customers" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_price_lists_store_id" ON "price_lists" USING btree ("store_id","id");--> statement-breakpoint
-- Liên kết chéo cửa hàng có sẵn (tạo qua lỗi BM-02) là dữ liệu sai: gỡ liên kết để ràng buộc kiểm được mọi dòng.
-- Audit order.created KHÔNG lưu customerId, nên chép giá trị cũ vào bảng sao lưu trước khi đặt NULL để đảo lại được.
-- Bảng nằm ngoài lược đồ drizzle (chỉ phục vụ đối soát), xóa được khi các cửa hàng đã đối soát xong.
CREATE TABLE IF NOT EXISTS "orders_cross_store_link_backup" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"old_customer_id" uuid,
	"old_price_list_id" uuid,
	"backed_up_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
COMMENT ON TABLE "orders_cross_store_link_backup" IS 'BM-02, migration 0046: customer_id/price_list_id cũ của đơn tham chiếu khách hoặc bảng giá thuộc cửa hàng khác, đã bị đặt NULL. Cột NULL nghĩa là liên kết đó vẫn đúng và không bị đổi. Đảo lại: bỏ fk_orders_store_customer/fk_orders_store_price_list rồi UPDATE orders từ bảng này.';--> statement-breakpoint
INSERT INTO "orders_cross_store_link_backup" ("order_id", "store_id", "old_customer_id", "old_price_list_id")
SELECT o."id", o."store_id",
	CASE WHEN c."store_id" <> o."store_id" THEN o."customer_id" END,
	CASE WHEN p."store_id" <> o."store_id" THEN o."price_list_id" END
FROM "orders" AS o
LEFT JOIN "customers" AS c ON c."id" = o."customer_id"
LEFT JOIN "price_lists" AS p ON p."id" = o."price_list_id"
WHERE c."store_id" <> o."store_id" OR p."store_id" <> o."store_id"
ON CONFLICT ("order_id") DO NOTHING;--> statement-breakpoint
UPDATE "orders" AS o SET "customer_id" = NULL FROM "customers" AS c WHERE o."customer_id" = c."id" AND c."store_id" <> o."store_id";--> statement-breakpoint
UPDATE "orders" AS o SET "price_list_id" = NULL FROM "price_lists" AS p WHERE o."price_list_id" = p."id" AND p."store_id" <> o."store_id";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_store_customer" FOREIGN KEY ("store_id","customer_id") REFERENCES "public"."customers"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_store_price_list" FOREIGN KEY ("store_id","price_list_id") REFERENCES "public"."price_lists"("store_id","id") ON DELETE no action ON UPDATE no action;
