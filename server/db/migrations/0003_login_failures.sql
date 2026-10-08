CREATE TABLE "login_failure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_failure_email" ON "login_failure" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_failure_ip" ON "login_failure" USING btree ("ip","created_at");