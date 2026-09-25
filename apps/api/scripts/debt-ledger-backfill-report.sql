-- Liệt kê khách hàng mà migration 0047_debt_ledger_backfill (sổ công nợ R3) đã điều chỉnh.
-- Chỉ đọc, chạy được nhiều lần. Cách chạy: xem docs/deploy.md, mục "Kiểm tra sau migration 0047".
--
-- Mỗi dòng là một khách: công nợ khách (không đổi), tổng còn lại của các khoản nợ trước và sau
-- khi điền ngược, phần "paid" đã chuyển sang giảm trừ, và các khoản nợ migration tạo hoặc giảm
-- trừ (nhận ra qua ghi chú "Điều chỉnh điền ngược").
SELECT
  "s"."name" AS "cua_hang",
  "c"."code" AS "ma_kh",
  "c"."name" AS "ten_kh",
  ("a"."changes" ->> 'currentDebt')::bigint AS "cong_no_kh",
  ("a"."changes" -> 'before' ->> 'debtsRemaining')::bigint AS "tong_con_lai_truoc",
  ("a"."changes" -> 'after' ->> 'debtsRemaining')::bigint AS "tong_con_lai_sau",
  ("a"."changes" ->> 'paidMovedToReduced')::bigint AS "paid_chuyen_sang_giam_tru",
  "c"."current_debt" AS "cong_no_kh_hien_tai",
  (
    SELECT string_agg(
      "d"."type" || ' ' || "d"."amount" || ' (con ' || "d"."remaining" || ', giam tru ' || "d"."reduced" || ')',
      '; ' ORDER BY "d"."created_at", "d"."id"
    )
    FROM "debts" AS "d"
    WHERE "d"."customer_id" = "c"."id" AND "d"."note" LIKE 'Điều chỉnh điền ngược%'
  ) AS "khoan_no_dien_nguoc",
  "a"."created_at" AS "luc_chay"
FROM "audit_logs" AS "a"
JOIN "customers" AS "c" ON "c"."id" = "a"."target_id"
JOIN "stores" AS "s" ON "s"."id" = "a"."store_id"
WHERE "a"."action" = 'debt_ledger.backfilled'
ORDER BY "s"."name", "c"."code";
