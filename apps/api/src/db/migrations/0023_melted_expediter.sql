ALTER TABLE "orders" ADD COLUMN "cash_amount" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transfer_amount" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "change" bigint DEFAULT 0 NOT NULL;