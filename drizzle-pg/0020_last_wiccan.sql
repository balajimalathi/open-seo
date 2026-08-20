ALTER TABLE "audit_lighthouse_results" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "audit_lighthouse_results" ADD COLUMN "cost_usd" real;--> statement-breakpoint
ALTER TABLE "audit_lighthouse_results" ADD COLUMN "credits_charged" integer;