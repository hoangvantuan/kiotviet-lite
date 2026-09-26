CREATE TABLE "cash_shifts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"opening_cash" bigint NOT NULL,
	"open_note" varchar(500),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"expected_cash" bigint,
	"counted_cash" bigint,
	"difference" bigint,
	"close_note" varchar(500),
	"close_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_cash_shifts_status" CHECK ("cash_shifts"."status" IN ('open', 'closed')),
	CONSTRAINT "chk_cash_shifts_opening_cash" CHECK ("cash_shifts"."opening_cash" >= 0),
	CONSTRAINT "chk_cash_shifts_closed_fields" CHECK ("cash_shifts"."status" = 'open' OR ("cash_shifts"."closed_at" IS NOT NULL AND "cash_shifts"."counted_cash" IS NOT NULL AND "cash_shifts"."expected_cash" IS NOT NULL AND "cash_shifts"."difference" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "order_returns" ADD COLUMN "refund_method" varchar(16);--> statement-breakpoint
ALTER TABLE "order_returns" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
-- BC-06: giờ bán của đơn. Đơn cũ lấy giờ tạo (không có nguồn giờ bán ngoại tuyến tin cậy),
-- nên thêm cột rỗng, chép created_at, rồi mới đặt mặc định và NOT NULL (không để now() ghi đè).
ALTER TABLE "orders" ADD COLUMN "sold_at" timestamp with time zone;--> statement-breakpoint
UPDATE "orders" SET "sold_at" = "created_at";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "sold_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "sold_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "code" varchar(32);--> statement-breakpoint
-- TIEN-109: cấp mã cho phiếu thu cũ theo thứ tự thời gian, cùng dạng PT-yymmdd-nnnn với phiếu mới
-- (ngày theo giờ Việt Nam như document-codes.service). Bộ đếm của ngày cũ tự gieo từ mã lớn nhất
-- khi cần, nên không phải ghi document_counters ở đây.
UPDATE "receipts" AS r
SET "code" = 'PT-' || numbered.day || '-' || lpad(numbered.n::text, greatest(4, length(numbered.n::text)), '0')
FROM (
	SELECT
		"id",
		to_char("created_at" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') AS day,
		-- Hơn 9999 phiếu một ngày thì số thứ tự dài hơn 4 chữ số, không bị lpad cắt bớt
		row_number() OVER (
			PARTITION BY "store_id", ("created_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
			ORDER BY "created_at", "id"
		) AS n
	FROM "receipts"
) AS numbered
WHERE r."id" = numbered."id";--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "payment_method" varchar(16);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "shifts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "bank_bin" varchar(6);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "bank_account_number" varchar(19);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "bank_account_name" varchar(50);--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "payment_method" varchar(16);--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_cash_shifts_open_user" ON "cash_shifts" USING btree ("store_id","user_id") WHERE "cash_shifts"."status" = 'open';--> statement-breakpoint
CREATE INDEX "idx_cash_shifts_store_opened" ON "cash_shifts" USING btree ("store_id","opened_at");--> statement-breakpoint
CREATE INDEX "idx_cash_shifts_store_user_opened" ON "cash_shifts" USING btree ("store_id","user_id","opened_at");--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_shift_id_cash_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_order_returns_shift" ON "order_returns" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "idx_orders_store_sold_at" ON "orders" USING btree ("store_id","sold_at");--> statement-breakpoint
CREATE INDEX "idx_orders_shift" ON "orders" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_receipts_store_code" ON "receipts" USING btree ("store_id","code");--> statement-breakpoint
CREATE INDEX "idx_receipts_shift" ON "receipts" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_shift" ON "supplier_payments" USING btree ("shift_id");