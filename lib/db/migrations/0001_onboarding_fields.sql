ALTER TABLE "profile" ADD COLUMN "business_duration" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "team_size" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "biggest_stressor" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;
