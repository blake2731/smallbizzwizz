import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const cpRole = pgTable(
  'cp_role',
  {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    title: text('title').notNull(),
    department: text('department').notNull(),
    mission: text('mission').notNull(),
    authority: text('authority').notNull(),
    restrictions: text('restrictions').notNull(),
    sortOrder: integer('sort_order').notNull().default(100),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('cp_role_department_idx').on(t.department, t.sortOrder)],
)

export const cpObjective = pgTable(
  'cp_objective',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    successCriteria: text('success_criteria').notNull(),
    ownerRole: text('owner_role').notNull().references(() => cpRole.slug),
    status: text('status').notNull().default('active'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('cp_objective_status_idx').on(t.status, t.updatedAt)],
)

export const cpWorkItem = pgTable(
  'cp_work_item',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('ready'),
    priority: text('priority').notNull().default('medium'),
    ownerRole: text('owner_role').notNull().references(() => cpRole.slug),
    requesterRole: text('requester_role').references(() => cpRole.slug),
    objectiveId: integer('objective_id').references(() => cpObjective.id, { onDelete: 'set null' }),
    nextAction: text('next_action').notNull().default(''),
    risk: text('risk').notNull().default('normal'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('cp_work_owner_status_idx').on(t.ownerRole, t.status, t.updatedAt),
    index('cp_work_objective_idx').on(t.objectiveId, t.updatedAt),
  ],
)

export const cpHandoff = pgTable(
  'cp_handoff',
  {
    id: serial('id').primaryKey(),
    workItemId: integer('work_item_id').references(() => cpWorkItem.id, { onDelete: 'set null' }),
    fromRole: text('from_role').notNull().references(() => cpRole.slug),
    toRole: text('to_role').notNull().references(() => cpRole.slug),
    summary: text('summary').notNull(),
    context: text('context').notNull().default(''),
    requiredOutput: text('required_output').notNull().default(''),
    status: text('status').notNull().default('open'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('cp_handoff_to_status_idx').on(t.toRole, t.status, t.updatedAt),
    index('cp_handoff_work_idx').on(t.workItemId, t.updatedAt),
  ],
)

export const cpDecision = pgTable(
  'cp_decision',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    decision: text('decision').notNull(),
    rationale: text('rationale').notNull().default(''),
    evidence: text('evidence').notNull().default(''),
    ownerRole: text('owner_role').notNull().references(() => cpRole.slug),
    status: text('status').notNull().default('active'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('cp_decision_owner_created_idx').on(t.ownerRole, t.createdAt)],
)

export const cpEvent = pgTable(
  'cp_event',
  {
    id: serial('id').primaryKey(),
    actorUserId: text('actor_user_id').notNull(),
    actorRole: text('actor_role').notNull().references(() => cpRole.slug),
    action: text('action').notNull(),
    objectType: text('object_type').notNull(),
    objectId: text('object_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('cp_event_created_idx').on(t.createdAt)],
)

export type CpRole = typeof cpRole.$inferSelect
export type CpObjective = typeof cpObjective.$inferSelect
export type CpWorkItem = typeof cpWorkItem.$inferSelect
export type CpHandoff = typeof cpHandoff.$inferSelect
export type CpDecision = typeof cpDecision.$inferSelect
export type CpEvent = typeof cpEvent.$inferSelect
