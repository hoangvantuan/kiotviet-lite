CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'throttled', 'dead');--> statement-breakpoint
CREATE TYPE "public"."notification_severity" AS ENUM('info', 'warn', 'error', 'critical');--> statement-breakpoint
CREATE TYPE "public"."notification_transport" AS ENUM('console', 'file', 'webhook', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('auth.login.suspicious', 'auth.pin.locked', 'order.high_value', 'stock.negative', 'sync.failed_repeatedly', 'audit.price_override', 'system.error.unhandled');--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"transport" "notification_transport" NOT NULL,
	"name" varchar(100) NOT NULL,
	"config_encrypted" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"event_type" "notification_type" NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"event_type" "notification_type" NOT NULL,
	"min_severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"channel_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"throttle_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channel_id_notification_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."notification_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_channel_id_notification_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."notification_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deliveries_throttle" ON "notification_deliveries" USING btree ("store_id","event_type","channel_id","created_at");