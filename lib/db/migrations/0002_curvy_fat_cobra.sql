CREATE TABLE "facility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_packet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"reporting_period_id" uuid NOT NULL,
	"insight_key" text NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"category" text,
	"subcategory" text,
	"section" text,
	"subsection" text,
	"line_item" text,
	"period" text,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"trigger_reason" text,
	"trend_direction" text NOT NULL,
	"supporting_metrics" jsonb NOT NULL,
	"thresholds_exceeded" jsonb,
	"periods_involved" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narrative" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"reporting_period_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"status" text NOT NULL,
	"model" text,
	"prompt_context" jsonb,
	"prompt_text" text NOT NULL,
	"narrative_text" text,
	"error_message" text,
	"supporting_insight_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "normalized_financial_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"reporting_period_id" uuid NOT NULL,
	"sheet_name" text NOT NULL,
	"row_number" integer NOT NULL,
	"section" text,
	"subsection" text,
	"category" text,
	"subcategory" text,
	"line_item" text NOT NULL,
	"period" text,
	"report_type" text,
	"actual" double precision,
	"budget" double precision,
	"variance" double precision,
	"actual_ppd" double precision,
	"budget_ppd" double precision,
	"variance_ppd" double precision,
	"is_total" boolean DEFAULT false NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"label" text NOT NULL,
	"period_key" text NOT NULL,
	"month_start" date,
	"source_period_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"status" text NOT NULL,
	"processing_stage" text DEFAULT 'uploaded' NOT NULL,
	"integrity_score" integer,
	"validation_stats" jsonb,
	"processing_errors" jsonb,
	"diagnostics" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insight_packet" ADD CONSTRAINT "insight_packet_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_packet" ADD CONSTRAINT "insight_packet_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_packet" ADD CONSTRAINT "insight_packet_reporting_period_id_reporting_period_id_fk" FOREIGN KEY ("reporting_period_id") REFERENCES "public"."reporting_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative" ADD CONSTRAINT "narrative_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative" ADD CONSTRAINT "narrative_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative" ADD CONSTRAINT "narrative_reporting_period_id_reporting_period_id_fk" FOREIGN KEY ("reporting_period_id") REFERENCES "public"."reporting_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_financial_record" ADD CONSTRAINT "normalized_financial_record_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_financial_record" ADD CONSTRAINT "normalized_financial_record_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_financial_record" ADD CONSTRAINT "normalized_financial_record_reporting_period_id_reporting_period_id_fk" FOREIGN KEY ("reporting_period_id") REFERENCES "public"."reporting_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_period" ADD CONSTRAINT "reporting_period_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_period" ADD CONSTRAINT "reporting_period_upload_id_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload" ADD CONSTRAINT "upload_facility_id_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facility_user_updated_idx" ON "facility" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "facility_user_name_unique" ON "facility" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_packet_upload_key_unique" ON "insight_packet" USING btree ("upload_id","insight_key");--> statement-breakpoint
CREATE INDEX "insight_packet_reporting_severity_idx" ON "insight_packet" USING btree ("reporting_period_id","severity","type");--> statement-breakpoint
CREATE INDEX "insight_packet_facility_period_idx" ON "insight_packet" USING btree ("facility_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "narrative_upload_audience_unique" ON "narrative" USING btree ("upload_id","audience");--> statement-breakpoint
CREATE INDEX "narrative_reporting_audience_idx" ON "narrative" USING btree ("reporting_period_id","audience");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_record_upload_row_unique" ON "normalized_financial_record" USING btree ("upload_id","sheet_name","row_number");--> statement-breakpoint
CREATE INDEX "normalized_record_period_category_idx" ON "normalized_financial_record" USING btree ("reporting_period_id","category","subcategory");--> statement-breakpoint
CREATE INDEX "normalized_record_facility_period_idx" ON "normalized_financial_record" USING btree ("facility_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "reporting_period_upload_unique" ON "reporting_period" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "reporting_period_facility_month_idx" ON "reporting_period" USING btree ("facility_id","month_start");--> statement-breakpoint
CREATE INDEX "upload_facility_created_idx" ON "upload" USING btree ("facility_id","created_at");--> statement-breakpoint
CREATE INDEX "upload_user_created_idx" ON "upload" USING btree ("user_id","created_at");