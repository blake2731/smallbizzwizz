import { pgTable, text, timestamp, uuid, index, boolean } from 'drizzle-orm/pg-core'

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

export type Profile = typeof profile.$inferSelect
export type NewProfile = typeof profile.$inferInsert
export type Conversation = typeof conversation.$inferSelect
export type NewConversation = typeof conversation.$inferInsert
export type Message = typeof message.$inferSelect
export type NewMessage = typeof message.$inferInsert
