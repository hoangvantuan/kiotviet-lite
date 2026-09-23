CREATE TYPE "public"."debt_type" AS ENUM('sale', 'opening');--> statement-breakpoint
ALTER TABLE "debts" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "type" "debt_type" DEFAULT 'sale' NOT NULL;