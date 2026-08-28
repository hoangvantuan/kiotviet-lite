ALTER TABLE "orders" ADD COLUMN "debt_limit_exceeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'order.debt_limit_exceeded';
