ALTER TYPE "public"."notification_type" ADD VALUE 'order.policy_violation_offline' BEFORE 'stock.negative';--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "debt_unlimited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "review_status" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "policy_violations" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_orders_store_review_status" ON "orders" USING btree ("store_id","review_status");--> statement-breakpoint
-- ADR-0009: NULL và 0 không còn nghĩa là "không giới hạn". Khách đang có nợ mà không có hạn mức
-- nào áp (hạn mức riêng NULL và nhóm cũng không đặt) trước đây được nợ vô hạn; giữ nguyên quyền đó
-- bằng cờ tường minh để việc bán cho khách quen không bị chặn đột ngột. Khách chưa có nợ thành
-- "không được nợ" cho tới khi chủ hoặc quản lý đặt hạn mức. Hạn mức 0 đặt tường minh giữ nghĩa chặn nợ.
UPDATE "customers" AS c
SET "debt_unlimited" = true
WHERE c."current_debt" > 0
  AND c."debt_limit" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "customer_groups" AS g
    WHERE g."id" = c."group_id" AND g."debt_limit" IS NOT NULL
  );
