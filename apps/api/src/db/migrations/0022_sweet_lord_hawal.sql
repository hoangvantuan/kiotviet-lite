CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"paid" bigint DEFAULT 0 NOT NULL,
	"remaining" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_debts_store_customer" ON "debts" USING btree ("store_id","customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_debts_store_order" ON "debts" USING btree ("store_id","order_id");--> statement-breakpoint
CREATE INDEX "idx_debts_remaining" ON "debts" USING btree ("store_id","customer_id","remaining") WHERE "debts"."remaining" > 0;