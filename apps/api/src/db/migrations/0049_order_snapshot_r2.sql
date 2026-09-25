ALTER TABLE "order_items" ADD COLUMN "conversion_factor" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_cost" bigint;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_cost_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "order_discount_allocated" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_amount_at_sale" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_debt_before" bigint;--> statement-breakpoint
-- R2 (ADR-0010): điền ngược ảnh chụp cho đơn cũ. Mọi dòng order_items hiện có đều là dòng cũ.
-- 1a. Hệ số quy đổi dự phòng: khớp tên đơn vị của dòng với bảng quy đổi của sản phẩm.
UPDATE order_items oi
SET conversion_factor = puc.conversion_factor
FROM orders o, product_unit_conversions puc
WHERE o.id = oi.order_id
  AND puc.store_id = o.store_id
  AND puc.product_id = oi.product_id
  AND puc.unit = oi.unit
  AND puc.conversion_factor >= 1;--> statement-breakpoint
-- 1b. Nguồn tin cậy hơn: phiếu kho bán của chính đơn (ghi chú = mã đơn). Chỉ dùng khi đơn có
-- đúng một dòng và một phiếu kho cho cùng sản phẩm/biến thể, và số lượng chia hết.
WITH sale_tx AS (
  SELECT o.id AS order_id, it.product_id, it.variant_id, -it.quantity AS base_qty,
         count(*) OVER (PARTITION BY o.id, it.product_id, it.variant_id) AS n
  FROM inventory_transactions it
  JOIN orders o ON o.store_id = it.store_id
   AND (it.note = o.order_number OR it.note = o.order_number || ' (offline sync)')
  WHERE it.type = 'sale'
), line AS (
  SELECT oi.id, oi.order_id, oi.product_id, oi.variant_id, oi.quantity,
         count(*) OVER (PARTITION BY oi.order_id, oi.product_id, oi.variant_id) AS n
  FROM order_items oi
)
UPDATE order_items oi
SET conversion_factor = (s.base_qty / l.quantity)::integer
FROM line l
JOIN sale_tx s ON s.order_id = l.order_id AND s.product_id = l.product_id
 AND s.variant_id IS NOT DISTINCT FROM l.variant_id
WHERE oi.id = l.id
  AND l.n = 1 AND s.n = 1
  AND l.quantity > 0
  AND s.base_qty % l.quantity = 0
  AND s.base_qty / l.quantity >= 1;--> statement-breakpoint
-- 2. Giá vốn ước tính một đơn vị gốc: giá vốn sau lần nhập gần nhất trước lúc bán, không có
-- thì giá vốn hiện tại (biến thể, rồi sản phẩm). Luôn gắn cờ ước tính.
UPDATE order_items oi
SET unit_cost = coalesce(
      (SELECT it.cost_after FROM inventory_transactions it
       WHERE it.store_id = o.store_id
         AND it.product_id = oi.product_id
         AND it.variant_id IS NOT DISTINCT FROM oi.variant_id
         AND it.cost_after IS NOT NULL
         AND it.created_at <= o.created_at
       ORDER BY it.created_at DESC, it.id DESC
       LIMIT 1),
      (SELECT pv.cost_price FROM product_variants pv WHERE pv.id = oi.variant_id),
      p.cost_price),
    unit_cost_estimated = true
FROM orders o, products p
WHERE o.id = oi.order_id AND p.id = oi.product_id;--> statement-breakpoint
-- 3. Phân bổ chiết khấu đơn đúng quy tắc allocateOrderDiscount: mỗi dòng làm tròn xuống theo
-- tỷ lệ thành tiền, phần dư vào dòng lớn nhất (bằng nhau thì dòng tạo trước).
WITH base AS (
  SELECT oi.id, oi.order_id, greatest(oi.line_total, 0) AS lt,
         (sum(greatest(oi.line_total, 0)) OVER (PARTITION BY oi.order_id))::bigint AS base_sum,
         row_number() OVER (PARTITION BY oi.order_id
                            ORDER BY oi.line_total DESC, oi.created_at, oi.id) AS rn,
         o.discount_amount
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.discount_amount > 0
), shares AS (
  SELECT id, order_id, rn, least(discount_amount, base_sum) AS d,
         lt * least(discount_amount, base_sum) / base_sum AS share
  FROM base
  WHERE base_sum > 0
), totals AS (
  SELECT id, rn, d, share, (sum(share) OVER (PARTITION BY order_id))::bigint AS share_sum FROM shares
)
UPDATE order_items oi
SET order_discount_allocated = t.share + CASE WHEN t.rn = 1 THEN t.d - t.share_sum ELSE 0 END
FROM totals t
WHERE oi.id = t.id;--> statement-breakpoint
-- 4. Khách đã trả lúc bán = tổng đơn - nợ ghi cho đơn. Nợ trước đơn của đơn cũ không suy ra
-- được (công nợ đã đổi nhiều lần), để NULL.
UPDATE orders o
SET paid_amount_at_sale = o.total - coalesce(
  (SELECT d.amount FROM debts d WHERE d.store_id = o.store_id AND d.order_id = o.id), 0);
