import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  uniqueIndex,
  date,
} from 'drizzle-orm/pg-core'

export const profile = pgTable('profile', {
  userId: text('user_id').primaryKey(),
  name: text('name'),
  businessType: text('business_type'),
  businessDuration: text('business_duration'),
  teamSize: text('team_size'),
  biggestStressor: text('biggest_stressor'),
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const conversation = pgTable(
  'conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('conversation_user_updated_idx').on(t.userId, t.updatedAt)],
)

export const message = pgTable(
  'message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    attachmentName: text('attachment_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('message_conversation_created_idx').on(t.conversationId, t.createdAt)],
)

export const facility = pgTable(
  'facility',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('facility_user_updated_idx').on(t.userId, t.updatedAt),
    uniqueIndex('facility_user_name_unique').on(t.userId, t.name),
  ],
)

export const upload = pgTable(
  'upload',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facility.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    checksumSha256: text('checksum_sha256'),
    status: text('status')
      .$type<
        | 'processing'
        | 'completed'
        | 'partial'
        | 'failed_validation'
        | 'failed_normalization'
        | 'failed_processing'
      >()
      .notNull(),
    processingStage: text('processing_stage')
      .$type<
        | 'uploaded'
        | 'parsing'
        | 'validating'
        | 'normalizing'
        | 'insights'
        | 'narratives'
        | 'persisting'
        | 'complete'
        | 'failed'
      >()
      .notNull()
      .default('uploaded'),
    integrityScore: integer('integrity_score'),
    validationStats: jsonb('validation_stats').$type<Record<string, unknown> | null>(),
    processingErrors: jsonb('processing_errors').$type<
      Array<Record<string, unknown>> | null
    >(),
    diagnostics: jsonb('diagnostics').$type<Record<string, unknown> | null>(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('upload_facility_created_idx').on(t.facilityId, t.createdAt),
    index('upload_user_created_idx').on(t.userId, t.createdAt),
  ],
)

export const reportingPeriod = pgTable(
  'reporting_period',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facility.id, { onDelete: 'cascade' }),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => upload.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    periodKey: text('period_key').notNull(),
    monthStart: date('month_start'),
    sourcePeriodLabel: text('source_period_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('reporting_period_upload_unique').on(t.uploadId),
    index('reporting_period_facility_month_idx').on(t.facilityId, t.monthStart),
  ],
)

export const normalizedFinancialRecord = pgTable(
  'normalized_financial_record',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facility.id, { onDelete: 'cascade' }),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => upload.id, { onDelete: 'cascade' }),
    reportingPeriodId: uuid('reporting_period_id')
      .notNull()
      .references(() => reportingPeriod.id, { onDelete: 'cascade' }),
    sheetName: text('sheet_name').notNull(),
    rowNumber: integer('row_number').notNull(),
    section: text('section'),
    subsection: text('subsection'),
    category: text('category'),
    subcategory: text('subcategory'),
    lineItem: text('line_item').notNull(),
    period: text('period'),
    reportType: text('report_type'),
    actual: doublePrecision('actual'),
    budget: doublePrecision('budget'),
    variance: doublePrecision('variance'),
    actualPpd: doublePrecision('actual_ppd'),
    budgetPpd: doublePrecision('budget_ppd'),
    variancePpd: doublePrecision('variance_ppd'),
    isTotal: boolean('is_total').notNull().default(false),
    isHidden: boolean('is_hidden').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('normalized_record_upload_row_unique').on(
      t.uploadId,
      t.sheetName,
      t.rowNumber,
    ),
    index('normalized_record_period_category_idx').on(
      t.reportingPeriodId,
      t.category,
      t.subcategory,
    ),
    index('normalized_record_facility_period_idx').on(t.facilityId, t.period),
  ],
)

export const insightPacket = pgTable(
  'insight_packet',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facility.id, { onDelete: 'cascade' }),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => upload.id, { onDelete: 'cascade' }),
    reportingPeriodId: uuid('reporting_period_id')
      .notNull()
      .references(() => reportingPeriod.id, { onDelete: 'cascade' }),
    insightKey: text('insight_key').notNull(),
    type: text('type').notNull(),
    severity: text('severity').notNull(),
    category: text('category'),
    subcategory: text('subcategory'),
    section: text('section'),
    subsection: text('subsection'),
    lineItem: text('line_item'),
    period: text('period'),
    title: text('title').notNull(),
    explanation: text('explanation').notNull(),
    triggerReason: text('trigger_reason'),
    trendDirection: text('trend_direction').notNull(),
    supportingMetrics: jsonb('supporting_metrics')
      .$type<Array<Record<string, unknown>>>()
      .notNull(),
    thresholdsExceeded: jsonb('thresholds_exceeded').$type<
      Array<Record<string, unknown>> | null
    >(),
    periodsInvolved: jsonb('periods_involved').$type<string[] | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('insight_packet_upload_key_unique').on(t.uploadId, t.insightKey),
    index('insight_packet_reporting_severity_idx').on(
      t.reportingPeriodId,
      t.severity,
      t.type,
    ),
    index('insight_packet_facility_period_idx').on(t.facilityId, t.period),
  ],
)

export const narrative = pgTable(
  'narrative',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facility.id, { onDelete: 'cascade' }),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => upload.id, { onDelete: 'cascade' }),
    reportingPeriodId: uuid('reporting_period_id')
      .notNull()
      .references(() => reportingPeriod.id, { onDelete: 'cascade' }),
    audience: text('audience').notNull(),
    status: text('status').notNull(),
    model: text('model'),
    promptContext: jsonb('prompt_context').$type<Record<string, unknown> | null>(),
    promptText: text('prompt_text').notNull(),
    narrativeText: text('narrative_text'),
    errorMessage: text('error_message'),
    supportingInsightIds: jsonb('supporting_insight_ids').$type<string[] | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('narrative_upload_audience_unique').on(t.uploadId, t.audience),
    index('narrative_reporting_audience_idx').on(t.reportingPeriodId, t.audience),
  ],
)

export type Profile = typeof profile.$inferSelect
export type NewProfile = typeof profile.$inferInsert
export type Conversation = typeof conversation.$inferSelect
export type NewConversation = typeof conversation.$inferInsert
export type Message = typeof message.$inferSelect
export type NewMessage = typeof message.$inferInsert
export type Facility = typeof facility.$inferSelect
export type NewFacility = typeof facility.$inferInsert
export type Upload = typeof upload.$inferSelect
export type NewUpload = typeof upload.$inferInsert
export type ReportingPeriod = typeof reportingPeriod.$inferSelect
export type NewReportingPeriod = typeof reportingPeriod.$inferInsert
export type NormalizedFinancialRecordRow = typeof normalizedFinancialRecord.$inferSelect
export type NewNormalizedFinancialRecordRow = typeof normalizedFinancialRecord.$inferInsert
export type InsightPacketRow = typeof insightPacket.$inferSelect
export type NewInsightPacketRow = typeof insightPacket.$inferInsert
export type NarrativeRow = typeof narrative.$inferSelect
export type NewNarrativeRow = typeof narrative.$inferInsert
