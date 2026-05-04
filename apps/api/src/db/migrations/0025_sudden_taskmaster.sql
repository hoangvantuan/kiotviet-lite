CREATE TABLE "debt_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"old_amount" bigint NOT NULL,
	"new_amount" bigint NOT NULL,
	"reason" varchar(500) NOT NULL,
	"adjusted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt_adjustments" ADD CONSTRAINT "debt_adjustments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_adjustments" ADD CONSTRAINT "debt_adjustments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_adjustments" ADD CONSTRAINT "debt_adjustments_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_debt_adjustments_store_created" ON "debt_adjustments" USING btree ("store_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_debt_adjustments_store_customer" ON "debt_adjustments" USING btree ("store_id","customer_id","created_at" DESC NULLS LAST);