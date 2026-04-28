CREATE TABLE "customer_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"default_price_list_id" uuid,
	"debt_limit" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(255),
	"address" text,
	"tax_id" varchar(20),
	"notes" text,
	"debt_limit" bigint,
	"group_id" uuid,
	"total_purchased" bigint DEFAULT 0 NOT NULL,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"current_debt" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_customer_groups_store_name" ON "customer_groups" USING btree ("store_id",LOWER("name"));--> statement-breakpoint
CREATE INDEX "idx_customer_groups_store" ON "customer_groups" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_customers_store_phone_alive" ON "customers" USING btree ("store_id","phone") WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_customers_store_group" ON "customers" USING btree ("store_id","group_id");--> statement-breakpoint
CREATE INDEX "idx_customers_store_name_lower" ON "customers" USING btree ("store_id",LOWER("name"));