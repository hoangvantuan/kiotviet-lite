-- TIEN-101 (quyết định nghiệp vụ 7): liệt kê dòng đơn có thể đã hoàn tiền dư do mã cũ áp tỷ lệ
-- chiết khấu đơn lại ở mỗi lần trả. Chỉ đọc, chạy được nhiều lần, chạy SAU migration
-- *_order_snapshot_r2 (cần order_items.order_discount_allocated đã điền ngược).
--
-- Điều kiện: đơn có chiết khấu cấp đơn (discount_amount > 0) và một dòng đơn nằm trong từ 2 phiếu
-- trả trở lên. Mỗi dòng kết quả là một dòng đơn: số tiền các phiếu đã hoàn, số tiền đúng theo
-- công thức ADR-0010 cho tổng số lượng đã trả, và phần chênh (dương là hoàn dư).
WITH "returned" AS (
  SELECT
    "ri"."order_item_id",
    count(DISTINCT "ri"."return_id") AS "so_phieu",
    sum("ri"."quantity") AS "sl_da_tra",
    sum("ri"."line_total") AS "da_hoan",
    string_agg("r"."return_number", ', ' ORDER BY "r"."created_at", "r"."id") AS "cac_phieu"
  FROM "order_return_items" AS "ri"
  JOIN "order_returns" AS "r" ON "r"."id" = "ri"."return_id"
  GROUP BY "ri"."order_item_id"
  HAVING count(DISTINCT "ri"."return_id") >= 2
)
SELECT
  "s"."name" AS "cua_hang",
  "o"."order_number" AS "ma_don",
  "oi"."product_name" AS "ten_hang",
  "oi"."variant_name" AS "bien_the",
  "oi"."quantity" AS "sl_mua",
  "x"."sl_da_tra",
  "x"."cac_phieu",
  "x"."da_hoan",
  "x"."dung"::bigint AS "dung",
  ("x"."da_hoan" - "x"."dung")::bigint AS "chenh_lech"
FROM (
  SELECT
    "rt".*,
    CASE
      WHEN "rt"."sl_da_tra" >= "oi"."quantity"
        THEN greatest("oi"."line_total" - "oi"."order_discount_allocated", 0)
      ELSE round(
        greatest("oi"."line_total" - "oi"."order_discount_allocated", 0)::numeric
          * "rt"."sl_da_tra" / "oi"."quantity"
      )
    END AS "dung"
  FROM "returned" AS "rt"
  JOIN "order_items" AS "oi" ON "oi"."id" = "rt"."order_item_id"
) AS "x"
JOIN "order_items" AS "oi" ON "oi"."id" = "x"."order_item_id"
JOIN "orders" AS "o" ON "o"."id" = "oi"."order_id"
JOIN "stores" AS "s" ON "s"."id" = "o"."store_id"
WHERE "o"."discount_amount" > 0
ORDER BY "s"."name", ("x"."da_hoan" - "x"."dung") DESC, "o"."order_number", "oi"."id";
