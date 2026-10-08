ALTER TABLE "order_item" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_item_option" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;