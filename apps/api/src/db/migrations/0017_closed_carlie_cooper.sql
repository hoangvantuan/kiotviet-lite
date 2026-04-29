CREATE TABLE "stock_check_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stock_check_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_name_snapshot" varchar(255) NOT NULL,
	"product_sku_snapshot" varchar(64) NOT NULL,
	"variant_label_snapshot" varchar(255),
	"system_qty" integer NOT NULL,
	"actual_qty" integer NOT NULL,
	"diff" integer NOT NULL,
	"note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_check_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stock_check_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"system_qty" integer NOT NULL,
	"actual_qty" integer NOT NULL,
	"diff" integer NOT NULL,
	"adjusted_by" uuid NOT NULL,
	"adjusted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"note" text,
	"total_items" integer DEFAULT 0 NOT NULL,
	"total_diff_positive" integer DEFAULT 0 NOT NULL,
	"total_diff_negative" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_check_items" ADD CONSTRAINT "stock_check_items_stock_check_id_stock_checks_id_fk" FOREIGN KEY ("stock_check_id") REFERENCES "public"."stock_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_check_items" ADD CONSTRAINT "stock_check_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_check_items" ADD CONSTRAINT "stock_check_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_check_logs" ADD CONSTRAINT "stock_check_logs_stock_check_id_stock_checks_id_fk" FOREIGN KEY ("stock_check_id") REFERENCES "public"."stock_checks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_check_logs" ADD CONSTRAINT "stock_check_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_check_logs" ADD CONSTRAINT "stock_check_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_check_logs" ADD CONSTRAINT "stock_check_logs_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_check_logs" ADD CONSTRAINT "stock_check_logs_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_checks" ADD CONSTRAINT "stock_checks_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_checks" ADD CONSTRAINT "stock_checks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_checks" ADD CONSTRAINT "stock_checks_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stock_check_items_check" ON "stock_check_items" USING btree ("stock_check_id");--> statement-breakpoint
CREATE INDEX "idx_stock_check_items_product" ON "stock_check_items" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_stock_check_logs_store_adjusted" ON "stock_check_logs" USING btree ("store_id","adjusted_at");--> statement-breakpoint
CREATE INDEX "idx_stock_check_logs_product_adjusted" ON "stock_check_logs" USING btree ("product_id","adjusted_at");--> statement-breakpoint
CREATE INDEX "idx_stock_check_logs_check" ON "stock_check_logs" USING btree ("stock_check_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_stock_checks_store_code" ON "stock_checks" USING btree ("store_id","code");--> statement-breakpoint
CREATE INDEX "idx_stock_checks_store_created" ON "stock_checks" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_stock_checks_store_status" ON "stock_checks" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_stock_check_items_target" ON "stock_check_items" USING btree ("stock_check_id","product_id",COALESCE("variant_id", '00000000-0000-0000-0000-000000000000'::uuid));