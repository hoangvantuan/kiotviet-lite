CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"note" varchar(500),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_store_created" ON "supplier_payments" USING btree ("store_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_store_supplier" ON "supplier_payments" USING btree ("store_id","supplier_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_store_creator" ON "supplier_payments" USING btree ("store_id","created_by");