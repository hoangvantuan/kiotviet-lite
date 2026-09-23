CREATE TABLE "supplier_debt_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"old_amount" bigint NOT NULL,
	"new_amount" bigint NOT NULL,
	"reason" varchar(500) NOT NULL,
	"type" varchar(16) DEFAULT 'adjustment' NOT NULL,
	"incurred_at" timestamp with time zone,
	"adjusted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_debt_adjustments" ADD CONSTRAINT "supplier_debt_adjustments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_debt_adjustments" ADD CONSTRAINT "supplier_debt_adjustments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_debt_adjustments" ADD CONSTRAINT "supplier_debt_adjustments_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_debt_adjustments_store_created" ON "supplier_debt_adjustments" USING btree ("store_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_supplier_debt_adjustments_store_supplier" ON "supplier_debt_adjustments" USING btree ("store_id","supplier_id","created_at" DESC NULLS LAST);