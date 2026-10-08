CREATE TYPE "public"."allergen" AS ENUM('gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs');--> statement-breakpoint
CREATE TYPE "public"."item_tag" AS ENUM('vegetarian', 'spicy', 'new');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('sq', 'en', 'it', 'de');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'preparing', 'served', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'confirmed', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'manager', 'waiter');--> statement-breakpoint
CREATE TYPE "public"."translated_entity" AS ENUM('menu_category', 'menu_item', 'option_group', 'menu_option');--> statement-breakpoint
CREATE TYPE "public"."translated_field" AS ENUM('name', 'description');--> statement-breakpoint
CREATE TABLE "dining_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"label" text,
	"qr_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dining_table_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "dining_table_number" UNIQUE("venue_id","number"),
	CONSTRAINT "dining_table_id_venue" UNIQUE("id","venue_id"),
	CONSTRAINT "dining_table_number_positive" CHECK ("dining_table"."number" > 0)
);
--> statement-breakpoint
CREATE TABLE "guest_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"client_ref" text NOT NULL,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"guest_name" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_order_id_venue" UNIQUE("id","venue_id"),
	CONSTRAINT "guest_order_client_ref" UNIQUE("session_id","client_ref")
);
--> statement-breakpoint
CREATE TABLE "menu_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_category_id_venue" UNIQUE("id","venue_id")
);
--> statement-breakpoint
CREATE TABLE "menu_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"price_lek" integer NOT NULL,
	"photo_url" text,
	"available" boolean DEFAULT true NOT NULL,
	"suggest_in_basket" boolean DEFAULT false NOT NULL,
	"tags" "item_tag"[] DEFAULT '{}'::item_tag[] NOT NULL,
	"allergens" "allergen"[] DEFAULT '{}'::allergen[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_id_venue" UNIQUE("id","venue_id"),
	CONSTRAINT "menu_item_price_not_negative" CHECK ("menu_item"."price_lek" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"price_delta_lek" integer DEFAULT 0 NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "menu_option_id_venue" UNIQUE("id","venue_id")
);
--> statement-breakpoint
CREATE TABLE "option_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "option_group_id_venue" UNIQUE("id","venue_id"),
	CONSTRAINT "option_group_select_range" CHECK ("option_group"."min_select" >= 0 AND "option_group"."max_select" >= 1 AND "option_group"."min_select" <= "option_group"."max_select")
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_name" jsonb NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_lek" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "order_item_id_venue" UNIQUE("id","venue_id"),
	CONSTRAINT "order_item_qty_positive" CHECK ("order_item"."qty" > 0),
	CONSTRAINT "order_item_price_not_negative" CHECK ("order_item"."unit_price_lek" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_item_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"option_name" jsonb NOT NULL,
	"price_delta_lek" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"provider" text DEFAULT 'cash' NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_lek" integer NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "payment_amount_not_negative" CHECK ("payment"."amount_lek" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_user_id_venue" UNIQUE("id","venue_id")
);
--> statement-breakpoint
CREATE TABLE "table_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'open' NOT NULL,
	"token_hash" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "table_session_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "table_session_id_venue" UNIQUE("id","venue_id"),
	CONSTRAINT "table_session_closed_at_matches_status" CHECK (("table_session"."status" = 'closed') = ("table_session"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"entity_type" "translated_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" "translated_field" NOT NULL,
	"lang" "language" NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "translation_one_text" UNIQUE("entity_type","entity_id","field","lang")
);
--> statement-breakpoint
CREATE TABLE "venue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"cover_url" text,
	"brand_color" text DEFAULT '#C8432A' NOT NULL,
	"languages" "language"[] DEFAULT '{sq,en}'::language[] NOT NULL,
	"default_language" "language" DEFAULT 'sq' NOT NULL,
	"timezone" text DEFAULT 'Europe/Tirane' NOT NULL,
	"opening_hours" jsonb NOT NULL,
	"currency" text DEFAULT 'ALL' NOT NULL,
	"plan" text DEFAULT 'pilot' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_slug_unique" UNIQUE("slug"),
	CONSTRAINT "venue_slug_format" CHECK ("venue"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "venue_brand_color_hex" CHECK ("venue"."brand_color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "venue_default_language_offered" CHECK ("venue"."default_language" = ANY ("venue"."languages"))
);
--> statement-breakpoint
ALTER TABLE "dining_table" ADD CONSTRAINT "dining_table_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_order" ADD CONSTRAINT "guest_order_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_order" ADD CONSTRAINT "guest_order_session_fk" FOREIGN KEY ("session_id","venue_id") REFERENCES "public"."table_session"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_category" ADD CONSTRAINT "menu_category_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_category_fk" FOREIGN KEY ("category_id","venue_id") REFERENCES "public"."menu_category"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_option" ADD CONSTRAINT "menu_option_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_option" ADD CONSTRAINT "menu_option_group_fk" FOREIGN KEY ("group_id","venue_id") REFERENCES "public"."option_group"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_group" ADD CONSTRAINT "option_group_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_group" ADD CONSTRAINT "option_group_item_fk" FOREIGN KEY ("item_id","venue_id") REFERENCES "public"."menu_item"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_fk" FOREIGN KEY ("order_id","venue_id") REFERENCES "public"."guest_order"("id","venue_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_item_fk" FOREIGN KEY ("item_id","venue_id") REFERENCES "public"."menu_item"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_option" ADD CONSTRAINT "order_item_option_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_option" ADD CONSTRAINT "order_item_option_line_fk" FOREIGN KEY ("order_item_id","venue_id") REFERENCES "public"."order_item"("id","venue_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_option" ADD CONSTRAINT "order_item_option_option_fk" FOREIGN KEY ("option_id","venue_id") REFERENCES "public"."menu_option"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_session_fk" FOREIGN KEY ("session_id","venue_id") REFERENCES "public"."table_session"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_call" ADD CONSTRAINT "service_call_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_call" ADD CONSTRAINT "service_call_session_fk" FOREIGN KEY ("session_id","venue_id") REFERENCES "public"."table_session"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_call" ADD CONSTRAINT "service_call_table_fk" FOREIGN KEY ("table_id","venue_id") REFERENCES "public"."dining_table"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_call" ADD CONSTRAINT "service_call_staff_fk" FOREIGN KEY ("acknowledged_by","venue_id") REFERENCES "public"."staff_user"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_session" ADD CONSTRAINT "table_session_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_session" ADD CONSTRAINT "table_session_table_fk" FOREIGN KEY ("table_id","venue_id") REFERENCES "public"."dining_table"("id","venue_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation" ADD CONSTRAINT "translation_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_order_board" ON "guest_order" USING btree ("venue_id","status","created_at");--> statement-breakpoint
CREATE INDEX "menu_category_venue" ON "menu_category" USING btree ("venue_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_item_category" ON "menu_item" USING btree ("venue_id","category_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_option_group" ON "menu_option" USING btree ("venue_id","group_id");--> statement-breakpoint
CREATE INDEX "option_group_item" ON "option_group" USING btree ("venue_id","item_id");--> statement-breakpoint
CREATE INDEX "order_item_order" ON "order_item" USING btree ("venue_id","order_id");--> statement-breakpoint
CREATE INDEX "order_item_option_line" ON "order_item_option" USING btree ("venue_id","order_item_id");--> statement-breakpoint
CREATE INDEX "payment_session" ON "payment" USING btree ("venue_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_call_one_open" ON "service_call" USING btree ("session_id") WHERE "service_call"."acknowledged_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_user_email_unique" ON "staff_user" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "table_session_one_open" ON "table_session" USING btree ("table_id") WHERE "table_session"."status" = 'open';--> statement-breakpoint
CREATE INDEX "table_session_venue_status" ON "table_session" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "translation_venue_entity" ON "translation" USING btree ("venue_id","entity_type","entity_id");