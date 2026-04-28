CREATE TABLE "price_list_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"price_list_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"is_overridden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"method" varchar(16) NOT NULL,
	"base_price_list_id" uuid,
	"formula_type" varchar(16),
	"formula_value" bigint,
	"rounding_rule" varchar(24) DEFAULT 'none' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_formula_required" CHECK ((method = 'direct' AND base_price_list_id IS NULL AND formula_type IS NULL AND formula_value IS NULL) OR (method = 'formula' AND base_price_list_id IS NOT NULL AND formula_type IS NOT NULL AND formula_value IS NOT NULL)),
	CONSTRAINT "check_effective_range" CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from)
);
--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_base_price_list_id_price_lists_id_fk" FOREIGN KEY ("base_price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_price_list_items_list_product" ON "price_list_items" USING btree ("price_list_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_price_list_items_product" ON "price_list_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_price_lists_store_name_alive" ON "price_lists" USING btree ("store_id",LOWER("name")) WHERE "price_lists"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_price_lists_store_created" ON "price_lists" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_price_lists_store_method_active" ON "price_lists" USING btree ("store_id","method","is_active");--> statement-breakpoint
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_default_price_list_id_fk" FOREIGN KEY ("default_price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE set null ON UPDATE no action;