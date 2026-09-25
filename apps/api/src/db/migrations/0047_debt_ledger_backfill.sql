-- R3 (TIEN-03, TIEN-01): công nợ khách chỉ còn một nguồn sự thật là các khoản nợ.
-- Tạo lại enum thay cho ADD VALUE: giá trị thêm bằng ADD VALUE không dùng được trong cùng
-- transaction, mà bước điền ngược bên dưới cần ghi loại 'adjustment' ngay.
ALTER TYPE "public"."debt_type" RENAME TO "debt_type_old";--> statement-breakpoint
CREATE TYPE "public"."debt_type" AS ENUM('sale', 'opening', 'adjustment');--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "type" TYPE "public"."debt_type" USING "type"::text::"public"."debt_type";--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "type" SET DEFAULT 'sale';--> statement-breakpoint
DROP TYPE "public"."debt_type_old";--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "reduced" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "note" varchar(500);--> statement-breakpoint
-- Điền ngược 1 (TIEN-01): "paid" trước đây gộp cả cấn trừ trả hàng và điều chỉnh giảm.
-- Tiền thực thu là tổng phân bổ phiếu thu; phần còn lại của "paid" chuyển sang "reduced".
WITH "alloc" AS (
  SELECT "debt_id", SUM("amount")::bigint AS "total"
  FROM "receipt_allocations"
  GROUP BY "debt_id"
)
UPDATE "debts" AS "d"
SET "paid" = LEAST("d"."paid", COALESCE("alloc"."total", 0)),
    "reduced" = "d"."paid" - LEAST("d"."paid", COALESCE("alloc"."total", 0))
FROM "debts" AS "d0"
LEFT JOIN "alloc" ON "alloc"."debt_id" = "d0"."id"
WHERE "d0"."id" = "d"."id" AND "d"."paid" > COALESCE("alloc"."total", 0);--> statement-breakpoint
-- Điền ngược 2 (TIEN-03): phần current_debt lớn hơn tổng còn lại của các khoản nợ là điều chỉnh
-- tăng nợ trước đây không tạo khoản nợ. Tạo một khoản nợ loại điều chỉnh cho phần chênh, ngày
-- phát sinh là lần điều chỉnh tăng gần nhất (không có thì lấy lúc chạy migration).
INSERT INTO "debts" ("id", "store_id", "customer_id", "order_id", "type", "amount", "paid", "reduced", "remaining", "note", "created_at")
SELECT gen_random_uuid(), "g"."store_id", "g"."customer_id", NULL, 'adjustment', "g"."gap", 0, 0, "g"."gap",
       'Điều chỉnh điền ngược: công nợ lệch tổng khoản nợ trước khi có sổ công nợ',
       COALESCE(
         (SELECT MAX("a"."created_at") FROM "debt_adjustments" AS "a"
          WHERE "a"."customer_id" = "g"."customer_id" AND "a"."new_amount" > "a"."old_amount"),
         now()
       )
FROM (
  SELECT "c"."id" AS "customer_id", "c"."store_id",
         "c"."current_debt" - COALESCE(SUM("d"."remaining"), 0) AS "gap"
  FROM "customers" AS "c"
  LEFT JOIN "debts" AS "d" ON "d"."customer_id" = "c"."id"
  GROUP BY "c"."id", "c"."store_id", "c"."current_debt"
) AS "g"
WHERE "g"."gap" > 0;--> statement-breakpoint
-- Điền ngược 3: chiều ngược lại (tổng còn lại lớn hơn current_debt) không sinh ra từ mã ứng dụng,
-- chỉ từ sửa tay. Giữ số công nợ khách đang thấy và giảm trừ phần dư theo FIFO, có ghi chú.
WITH "excess" AS (
  SELECT "c"."id" AS "customer_id", COALESCE(SUM("d"."remaining"), 0) - "c"."current_debt" AS "excess"
  FROM "customers" AS "c"
  JOIN "debts" AS "d" ON "d"."customer_id" = "c"."id"
  GROUP BY "c"."id", "c"."current_debt"
  HAVING COALESCE(SUM("d"."remaining"), 0) > "c"."current_debt"
), "ordered" AS (
  SELECT "d"."id", "d"."remaining", "e"."excess",
         SUM("d"."remaining") OVER (PARTITION BY "d"."customer_id" ORDER BY "d"."created_at", "d"."id") AS "cum"
  FROM "debts" AS "d"
  JOIN "excess" AS "e" ON "e"."customer_id" = "d"."customer_id"
  WHERE "d"."remaining" > 0
), "settle" AS (
  SELECT "id", LEAST("remaining", GREATEST(0, "excess" - ("cum" - "remaining"))) AS "amount"
  FROM "ordered"
)
UPDATE "debts" AS "d"
SET "remaining" = "d"."remaining" - "settle"."amount",
    "reduced" = "d"."reduced" + "settle"."amount",
    "note" = COALESCE("d"."note", 'Điều chỉnh điền ngược: giảm trừ phần khoản nợ vượt công nợ khách')
FROM "settle"
WHERE "settle"."id" = "d"."id" AND "settle"."amount" > 0;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "chk_debts_balance" CHECK ("debts"."amount" = "debts"."paid" + "debts"."reduced" + "debts"."remaining");--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "chk_debts_non_negative" CHECK ("debts"."paid" >= 0 AND "debts"."reduced" >= 0 AND "debts"."remaining" >= 0);
