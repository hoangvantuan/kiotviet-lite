ALTER TABLE "orders" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "synced_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_synced_by_user_id_users_id_fk" FOREIGN KEY ("synced_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
-- Sửa tay sau drizzle-kit: thêm khóa ngoại NOT VALID rồi VALIDATE riêng để không giữ khóa ghi
-- trên bảng orders trong lúc quét (khi sinh lại migration phải giữ hai dòng này)
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_synced_by_user_id_users_id_fk";