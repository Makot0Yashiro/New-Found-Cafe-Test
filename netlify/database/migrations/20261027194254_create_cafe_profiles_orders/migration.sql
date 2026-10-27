CREATE TABLE "cafe_orders" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"customer" text NOT NULL,
	"order_type" text NOT NULL,
	"table_no" text DEFAULT '' NOT NULL,
	"payment" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"items" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"coupon" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Received' NOT NULL,
	"status_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dest_lat" double precision,
	"dest_lng" double precision,
	"address" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cafe_profiles" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"pay_method" text DEFAULT 'cash' NOT NULL,
	"pay_account" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cafe_order_request" ON "cafe_orders" ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "cafe_order_owner" ON "cafe_orders" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "cafe_orders" ADD CONSTRAINT "cafe_orders_user_id_cafe_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "cafe_profiles"("id");