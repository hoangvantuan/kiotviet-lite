ALTER TABLE "stores" ADD COLUMN "debt_warning_percent" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "debt_overdue_days" varchar(50) DEFAULT '30,60,90' NOT NULL;