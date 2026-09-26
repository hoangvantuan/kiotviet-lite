-- Bộ bất biến dữ liệu (GL-14). Chỉ đọc dữ liệu nghiệp vụ, không sửa gì.
-- Chạy: psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f apps/api/scripts/invariants.sql
-- Có vi phạm: in từng dòng lệch rồi RAISE EXCEPTION, psql thoát mã khác 0.
-- Không vi phạm: in "Bất biến: 0 vi phạm", thoát 0.
--
-- Mọi kiểm chạy trong cùng một snapshot (REPEATABLE READ) để không báo lệch giả
-- khi chạy trên production đang có giao dịch ghi.

\set QUIET on
\pset footer off

BEGIN ISOLATION LEVEL REPEATABLE READ;

CREATE TEMP TABLE invariant_violations (
  check_name text NOT NULL,
  store_id uuid,
  entity text NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

-- I1. Công nợ khách: customers.current_debt = tổng debts.remaining của khách (ADR 0003)
INSERT INTO invariant_violations
SELECT 'I1_customer_debt', c.store_id, 'customer ' || c.code,
       format('current_debt=%s, sum(debts.remaining)=%s, lệch=%s',
              c.current_debt, coalesce(d.remaining, 0), c.current_debt - coalesce(d.remaining, 0))
FROM customers c
LEFT JOIN (SELECT customer_id, sum(remaining) AS remaining FROM debts GROUP BY customer_id) d
  ON d.customer_id = c.id
WHERE c.current_debt <> coalesce(d.remaining, 0);

-- I2. Khoản nợ: amount = paid + reduced + remaining, không số âm (ADR 0008). Riêng tiền khách
-- trả trước là nợ đầu kỳ âm: paid = 0, phần đã cấn ghi reduced âm, remaining chạy từ amount về 0
-- (ADR 0011).
INSERT INTO invariant_violations
SELECT 'I2_debt_balance', d.store_id, 'debt ' || d.id,
       format('type=%s, amount=%s, paid=%s, reduced=%s, remaining=%s',
              d.type, d.amount, d.paid, d.reduced, d.remaining)
FROM debts d
WHERE d.amount <> d.paid + d.reduced + d.remaining
   OR (d.type = 'opening' AND d.amount < 0
       AND (d.paid <> 0 OR d.reduced > 0 OR d.remaining > 0 OR d.remaining < d.amount))
   OR (NOT (d.type = 'opening' AND d.amount < 0)
       AND (d.paid < 0 OR d.reduced < 0 OR d.remaining < 0));

-- I3. Phiếu thu: số thu = tổng phân bổ
INSERT INTO invariant_violations
SELECT 'I3_receipt_allocated', r.store_id, 'receipt ' || r.id,
       format('amount=%s, sum(allocations)=%s', r.amount, coalesce(sum(a.amount), 0))
FROM receipts r
LEFT JOIN receipt_allocations a ON a.receipt_id = r.id
GROUP BY r.id
HAVING r.amount <> coalesce(sum(a.amount), 0);

-- I4. Dòng phân bổ: số dương, khoản nợ cùng cửa hàng và cùng khách với phiếu thu
INSERT INTO invariant_violations
SELECT 'I4_allocation_target', r.store_id, 'receipt_allocation ' || a.id,
       format('amount=%s, receipt(store=%s, customer=%s), debt(store=%s, customer=%s)',
              a.amount, r.store_id, r.customer_id, d.store_id, d.customer_id)
FROM receipt_allocations a
JOIN receipts r ON r.id = a.receipt_id
JOIN debts d ON d.id = a.debt_id
WHERE a.amount <= 0 OR d.store_id <> r.store_id OR d.customer_id <> r.customer_id;

-- I5. Số đã trả của khoản nợ = tổng phân bổ của phiếu thu còn hiệu lực. Từ ADR 0008, paid chỉ
-- tăng qua phiếu thu; cấn trừ khi trả hàng và điều chỉnh giảm ghi vào reduced. Phiếu thu đã hủy
-- (TIEN-107) giữ dòng phân bổ làm vết nhưng đã đảo paid, nên không tính.
INSERT INTO invariant_violations
SELECT 'I5_paid_allocated', d.store_id, 'debt ' || d.id,
       format('paid=%s, sum(allocations)=%s', d.paid, coalesce(sum(a.amount), 0))
FROM debts d
LEFT JOIN (
  SELECT ra.debt_id, ra.amount
  FROM receipt_allocations ra
  JOIN receipts r ON r.id = ra.receipt_id AND r.status = 'active'
) a ON a.debt_id = d.id
GROUP BY d.id
HAVING d.paid <> coalesce(sum(a.amount), 0);

-- I6. Tồn kho = tổng sổ giao dịch kho (ADR 0006). Sản phẩm không biến thể so theo dòng sổ
-- variant_id IS NULL; sản phẩm có biến thể so tồn từng biến thể với dòng sổ của biến thể đó.
INSERT INTO invariant_violations
SELECT 'I6_stock_ledger', s.store_id, s.entity,
       format('stock=%s, sum(inventory_transactions.quantity)=%s, lệch=%s',
              s.stock, s.ledger, s.stock - s.ledger)
FROM (
  SELECT p.store_id, 'product ' || p.sku AS entity, p.current_stock AS stock,
         coalesce((SELECT sum(t.quantity) FROM inventory_transactions t
                   WHERE t.product_id = p.id AND t.variant_id IS NULL), 0) AS ledger
  FROM products p
  WHERE NOT p.has_variants
  UNION ALL
  SELECT v.store_id, 'variant ' || v.sku, v.stock_quantity,
         coalesce((SELECT sum(t.quantity) FROM inventory_transactions t
                   WHERE t.variant_id = v.id), 0)
  FROM product_variants v
) s
WHERE s.stock <> s.ledger;

-- I7. Công nợ NCC = tổng (phiếu nhập - đã trả) - phần nợ giảm khi hủy phiếu nhập - phần nợ giảm
-- khi trả hàng nhập + tổng điều chỉnh (mới - cũ) - tổng phiếu chi còn hiệu lực (KHO-11, TIEN-107)
INSERT INTO invariant_violations
SELECT 'I7_supplier_debt', s.store_id, 'supplier ' || s.code,
       format('current_debt=%s, tính lại=%s, lệch=%s', s.current_debt, x.expected, s.current_debt - x.expected)
FROM suppliers s
CROSS JOIN LATERAL (
  SELECT coalesce((SELECT sum(p.total_amount - p.paid_amount - p.cancel_debt_reduction)
                   FROM purchase_orders p WHERE p.supplier_id = s.id), 0)
       - coalesce((SELECT sum(pr.debt_reduction_amount) FROM purchase_returns pr
                   WHERE pr.supplier_id = s.id), 0)
       + coalesce((SELECT sum(a.new_amount - a.old_amount) FROM supplier_debt_adjustments a
                   WHERE a.supplier_id = s.id), 0)
       - coalesce((SELECT sum(sp.amount) FROM supplier_payments sp
                   WHERE sp.supplier_id = s.id AND sp.status = 'active'), 0) AS expected
) x
WHERE s.current_debt <> x.expected;

-- I8. Không có công nợ âm. Công nợ khách âm chỉ là tiền trả trước (I1, I2, ADR 0011), nên với
-- khách chỉ kiểm không có trạng thái vừa còn nợ vừa còn tiền trả trước (nợ mới phải cấn hết
-- tiền trả trước trước).
INSERT INTO invariant_violations
SELECT 'I8_negative_debt', c.store_id, 'customer ' || c.code,
       format('sum(remaining>0)=%s, sum(remaining<0)=%s',
              sum(d.remaining) FILTER (WHERE d.remaining > 0),
              sum(d.remaining) FILTER (WHERE d.remaining < 0))
FROM customers c
JOIN debts d ON d.customer_id = c.id
GROUP BY c.id
HAVING bool_or(d.remaining > 0) AND bool_or(d.remaining < 0)
UNION ALL
SELECT 'I8_negative_debt', store_id, 'supplier ' || code, format('current_debt=%s', current_debt)
FROM suppliers WHERE current_debt < 0;

-- I9. Tiền trả trước đã cấn: với mỗi khách, tổng prepayment_applied của các khoản nợ bằng phần
-- đã dùng của các khoản trả trước (-sum(reduced)). Trả hàng hoàn phần này về trả trước (ADR 0011).
INSERT INTO invariant_violations
SELECT 'I9_prepayment_applied', c.store_id, 'customer ' || c.code,
       format('applied=%s, used=%s', x.applied, x.used)
FROM customers c
JOIN (
  SELECT customer_id,
         COALESCE(sum(prepayment_applied), 0) AS applied,
         COALESCE(-sum(reduced) FILTER (WHERE type = 'opening' AND amount < 0), 0) AS used
  FROM debts GROUP BY customer_id
) x ON x.customer_id = c.id
WHERE x.applied <> x.used;

-- I10. Dòng sổ kho có tham chiếu phải trỏ tới chứng từ có thật cùng cửa hàng, đúng loại (POS-18).
-- Dòng chứng từ cũ không khớp được ghi chú lúc điền (reference_id NULL) không kiểm ở đây.
INSERT INTO invariant_violations
SELECT 'I10_inventory_reference', t.store_id, 'inventory_transaction ' || t.id,
       format('type=%s, reference=%s/%s', t.type, t.reference_type, t.reference_id)
FROM inventory_transactions t
WHERE t.reference_id IS NOT NULL
  AND NOT CASE t.reference_type
    WHEN 'order' THEN t.type IN ('sale', 'order_cancel') AND EXISTS (
      SELECT 1 FROM orders o WHERE o.id = t.reference_id AND o.store_id = t.store_id)
    WHEN 'order_return' THEN t.type = 'return' AND EXISTS (
      SELECT 1 FROM order_returns r WHERE r.id = t.reference_id AND r.store_id = t.store_id)
    WHEN 'purchase_order' THEN t.type IN ('purchase', 'purchase_cancel') AND EXISTS (
      SELECT 1 FROM purchase_orders po WHERE po.id = t.reference_id AND po.store_id = t.store_id)
    WHEN 'purchase_return' THEN t.type = 'purchase_return' AND EXISTS (
      SELECT 1 FROM purchase_returns pr WHERE pr.id = t.reference_id AND pr.store_id = t.store_id)
    WHEN 'stock_check' THEN t.type = 'stock_check' AND EXISTS (
      SELECT 1 FROM stock_checks sc WHERE sc.id = t.reference_id AND sc.store_id = t.store_id)
    WHEN 'product' THEN t.type = 'initial_stock' AND t.reference_id = t.product_id
    ELSE false
  END;

-- I11. Hàng chưa bật bán số lẻ thì tồn là số nguyên (GL-07, ADR-0015 mục 2): mọi đường ghi tồn
-- đều kiểm cờ, và chỉ tắt được cờ khi tồn đã nguyên. Biến thể đã xóa không tính (không bán được nữa).
INSERT INTO invariant_violations
SELECT 'I11_decimal_stock', p.store_id, 'product ' || p.sku, format('current_stock=%s', p.current_stock)
FROM products p
WHERE NOT p.allow_decimal_quantity AND p.current_stock <> trunc(p.current_stock)
UNION ALL
SELECT 'I11_decimal_stock', v.store_id, 'variant ' || v.sku, format('stock_quantity=%s', v.stock_quantity)
FROM product_variants v
JOIN products p ON p.id = v.product_id
WHERE NOT p.allow_decimal_quantity AND v.deleted_at IS NULL
  AND v.stock_quantity <> trunc(v.stock_quantity);

\pset footer on
SELECT check_name, count(*) AS violations
FROM invariant_violations GROUP BY check_name ORDER BY check_name;
\pset footer off

SELECT check_name, store_id, entity, detail
FROM invariant_violations ORDER BY check_name, store_id, entity;

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM invariant_violations;
  IF n > 0 THEN
    RAISE EXCEPTION 'Bất biến: % vi phạm, xem bảng ở trên', n;
  END IF;
  RAISE NOTICE 'Bất biến: 0 vi phạm';
END
$$;

COMMIT;
