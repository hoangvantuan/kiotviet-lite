CREATE TABLE "print_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"logo_url" text,
	"slogan" varchar(100),
	"default_paper_size" varchar(8) DEFAULT '58mm' NOT NULL,
	"show_old_debt" boolean DEFAULT false NOT NULL,
	"show_new_debt" boolean DEFAULT true NOT NULL,
	"show_cost_price" boolean DEFAULT false NOT NULL,
	"show_discount" boolean DEFAULT true NOT NULL,
	"show_notes" boolean DEFAULT true NOT NULL,
	"show_customer_name" boolean DEFAULT true NOT NULL,
	"show_customer_phone" boolean DEFAULT true NOT NULL,
	"show_sku" boolean DEFAULT false NOT NULL,
	"footer_text" varchar(200) DEFAULT 'Cảm ơn quý khách!' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_settings" ADD CONSTRAINT "print_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_print_settings_store" ON "print_settings" USING btree ("store_id");