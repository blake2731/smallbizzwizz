import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  cpDecision,
  cpEvent,
  cpHandoff,
  cpObjective,
  cpRole,
  cpWorkItem,
  type CpDecision,
  type CpEvent,
  type CpHandoff,
  type CpObjective,
  type CpRole,
  type CpWorkItem,
} from '@/lib/control-plane-schema'

const ROLE_SEED = [
  {
    slug: 'ceo',
    name: 'CEO',
    title: 'Chief Executive Officer',
    department: 'Executive Office',
    mission: 'Set company direction, choose major bets, allocate resources, and hold final accountability for company outcomes.',
    authority: 'Final authority on company strategy, capital allocation, executive appointments, irreversible company commitments, and cross-functional priority conflicts.',
    restrictions: 'Material decisions must leave a record. High-risk external actions require explicit authorization and traceability.',
    sortOrder: 10,
  },
  {
    slug: 'strategy',
    name: 'Adrian Vale',
    title: 'Strategic Head',
    department: 'Executive Office',
    mission: 'Translate CEO objectives into coherent cross-functional plans and keep departments aligned around the same outcomes.',
    authority: 'May coordinate priorities, dependency resolution, and escalation across departments. Advises the CEO and CTO on company planning.',
    restrictions: 'Coordination authority does not silently override a functional owner. Cross-domain conflicts must be surfaced and recorded.',
    sortOrder: 20,
  },
  {
    slug: 'cto',
    name: 'Elias Mercer',
    title: 'Chief Technology Officer',
    department: 'Engineering & Technology',
    mission: 'Own technical strategy and build systems that are correct, secure, maintainable, observable, and economically justified.',
    authority: 'Final technical authority on architecture, engineering standards, infrastructure strategy, technical risk, and engineering capacity.',
    restrictions: 'Escalate decisions that materially change company strategy, legal exposure, financial commitments, or approved product scope.',
    sortOrder: 30,
  },
  {
    slug: 'product',
    name: 'Maya Chen',
    title: 'Product Manager',
    department: 'Product & Strategy',
    mission: 'Turn company strategy and customer evidence into defined products, experiments, requirements, and measurable outcomes.',
    authority: 'Owns product scope, roadmap prioritization, requirements, experiments, and product success criteria.',
    restrictions: 'Product assumptions must be labeled as assumptions until supported. Product may not dictate unsafe technical implementation.',
    sortOrder: 40,
  },
  {
    slug: 'design',
    name: 'Nora Voss',
    title: 'Product Designer / UX Systems Lead',
    department: 'Experience & Design',
    mission: 'Make company and product systems understandable, usable, accessible, and grounded in observed human behavior.',
    authority: 'Owns interaction design, information architecture, usability standards, prototyping, and design-system decisions within product constraints.',
    restrictions: 'Design claims about users require research evidence or must be labeled as hypotheses.',
    sortOrder: 50,
  },
  {
    slug: 'engineer',
    name: 'Software Engineer',
    title: 'Software Engineer',
    department: 'Engineering & Technology',
    mission: 'Implement approved product and platform work as maintainable, tested production software.',
    authority: 'Owns implementation choices within approved architecture and may reject unsafe or technically invalid implementation requests.',
    restrictions: 'Production changes require traceability, review appropriate to risk, and a clear rollback path for high-risk changes.',
    sortOrder: 60,
  },
  {
    slug: 'platform',
    name: 'Platform / Reliability Engineer',
    title: 'Platform / DevOps / Reliability Engineer',
    department: 'Engineering & Technology',
    mission: 'Keep infrastructure, deployments, observability, backups, and operational automation reliable.',
    authority: 'Owns CI/CD, runtime environments, deployment mechanisms, observability, reliability practices, and incident response procedures.',
    restrictions: 'Destructive infrastructure changes require explicit approval and recovery planning.',
    sortOrder: 70,
  },
  {
    slug: 'quality',
    name: 'Quality & Security Engineer',
    title: 'Quality & Security Engineer',
    department: 'Engineering & Technology',
    mission: 'Independently verify quality, security, privacy, and release claims before the company treats them as established.',
    authority: 'May block releases for material correctness, security, privacy, or evidence failures and escalate directly to the CTO or CEO.',
    restrictions: 'A green build is not proof of security or product correctness; claims must match the evidence actually collected.',
    sortOrder: 80,
  },
  {
    slug: 'growth',
    name: 'Growth & Marketing Lead',
    title: 'Growth & Marketing Lead',
    department: 'Growth & Revenue',
    mission: 'Create qualified demand through positioning, acquisition, content, experiments, and measurable growth systems.',
    authority: 'Owns positioning, campaign strategy, acquisition channels, growth experiments, and marketing analytics.',
    restrictions: 'May not fabricate capabilities, testimonials, outcomes, guarantees, or unsupported market claims.',
    sortOrder: 90,
  },
  {
    slug: 'sales',
    name: 'Sales / Business Development Lead',
    title: 'Sales / Business Development Lead',
    department: 'Growth & Revenue',
    mission: 'Convert qualified demand into revenue and return high-fidelity buyer intelligence to the company.',
    authority: 'Owns prospecting, qualification, discovery, proposals, negotiations, partnerships, and pipeline management within approved commercial boundaries.',
    restrictions: 'External commitments must be accurate and attributable. Outreach or commitments requiring CEO approval may not be inferred from ambiguous language.',
    sortOrder: 100,
  },
  {
    slug: 'operations',
    name: 'Customer Success & Business Operations Lead',
    title: 'Customer Success & Business Operations Lead',
    department: 'Customer Experience & Operations',
    mission: 'Turn company promises into delivered customer outcomes while keeping recurring company operations consistent and auditable.',
    authority: 'Owns onboarding, support, retention, operational procedures, handoff completeness, customer-outcome records, and recurring internal processes.',
    restrictions: 'Customer claims and case studies require permission and measured evidence. Operational policy changes must be versioned and attributable.',
    sortOrder: 110,
  },
] as const

let schemaReady: Promise<void> | null = null

export function workId(id: number) {
  return `WORK-${String(id).padStart(4, '0')}`
}

export function handoffId(id: number) {
  return `HANDOFF-${String(id).padStart(4, '0')}`
}

export function decisionId(id: number) {
  return `DEC-${String(id).padStart(4, '0')}`
}

export function objectiveId(id: number) {
  return `OBJ-${String(id).padStart(4, '0')}`
}

export async function ensureControlPlaneSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cp_role (
          slug text PRIMARY KEY,
          name text NOT NULL,
          title text NOT NULL,
          department text NOT NULL,
          mission text NOT NULL,
          authority text NOT NULL,
          restrictions text NOT NULL,
          sort_order integer NOT NULL DEFAULT 100,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cp_role_department_idx ON cp_role (department, sort_order)`)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cp_objective (
          id serial PRIMARY KEY,
          title text NOT NULL,
          description text NOT NULL,
          success_criteria text NOT NULL,
          owner_role text NOT NULL REFERENCES cp_role(slug),
          status text NOT NULL DEFAULT 'active',
          created_by text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cp_objective_status_idx ON cp_objective (status, updated_at)`)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cp_work_item (
          id serial PRIMARY KEY,
          title text NOT NULL,
          description text NOT NULL DEFAULT '',
          status text NOT NULL DEFAULT 'ready',
          priority text NOT NULL DEFAULT 'medium',
          owner_role text NOT NULL REFERENCES cp_role(slug),
          requester_role text REFERENCES cp_role(slug),
          objective_id integer REFERENCES cp_objective(id) ON DELETE SET NULL,
          next_action text NOT NULL DEFAULT '',
          risk text NOT NULL DEFAULT 'normal',
          created_by text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cp_work_owner_status_idx ON cp_work_item (owner_role, status, updated_at)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cp_work_objective_idx ON cp_work_item (objective_id, updated_at)`)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cp_handoff (
          id serial PRIMARY KEY,
          work_item_id integer REFERENCES cp_work_item(id) ON DELETE SET NULL,
          from_role text NOT NULL REFERENCES cp_role(slug),
          to_role text NOT NULL REFERENCES cp_role(slug),
          summary text NOT NULL,
          context text NOT NULL DEFAULT '',
          required_output text NOT NULL DEFAULT '',
          status text NOT NULL DEFAULT 'open',
          created_by text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cp_handoff_to_status_idx ON cp_handoff (to_role, status, updated_at)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cp_handoff_work_idx ON cp_handoff (work_item_id, updated_at)`)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cp_decision (
          id serial PRIMARY KEY,
          title text NOT NULL,
          decision text NOT NULL,
          rationale text NOT NULL DEFAULT '',
          evidence text NOT NULL DEFAULT '',
          owner_role text NOT NULL REFERENCES cp_role(slug),
          status text NOT NULL DEFAULT 'active',
          created_by text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cp_decision_owner_created_idx ON cp_decision (owner_role, created_at)`)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cp_event (
          id serial PRIMARY KEY,
          actor_user_id text NOT NULL,
          actor_role text NOT NULL REFERENCES cp_role(slug),
          action text NOT NULL,
          object_type text NOT NULL,
          object_id text NOT NULL,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS cp_event_created_idx ON cp_event (created_at)`)

      await db
        .insert(cpRole)
        .values(ROLE_SEED.map((role) => ({ ...role })))
        .onConflictDoNothing({ target: cpRole.slug })

      const existingObjective = await db.select({ id: cpObjective.id }).from(cpObjective).limit(1)
      let operatingObjectiveId = existingObjective[0]?.id

      if (!operatingObjectiveId) {
        const [created] = await db
          .insert(cpObjective)
          .values({
            title: 'Establish the company operating system',
            description: 'Create durable shared state so every role can resume work, receive handoffs, inspect decisions, and coordinate without relying on conversation memory.',
            successCriteria: 'A role can open its station, see owned work and incoming handoffs, understand relevant decisions, complete work, and hand responsibility to another role without a verbal reconstruction from the CEO.',
            ownerRole: 'cto',
            status: 'active',
            createdBy: 'system-bootstrap',
          })
          .returning({ id: cpObjective.id })
        operatingObjectiveId = created.id
      }

      const existingWork = await db.select({ id: cpWorkItem.id }).from(cpWorkItem).limit(1)
      if (!existingWork.length && operatingObjectiveId) {
        await db.insert(cpWorkItem).values({
          title: 'Launch Control Plane Prototype 0',
          description: 'Deliver the smallest real company coordination surface with persistent roles, work, decisions, handoffs, and an audit trail.',
          status: 'active',
          priority: 'critical',
          ownerRole: 'cto',
          requesterRole: 'ceo',
          objectiveId: operatingObjectiveId,
          nextAction: 'Validate the production workflow by handing a real follow-up task to another role.',
          risk: 'normal',
          createdBy: 'system-bootstrap',
        })
      }
    })().catch((error) => {
      schemaReady = null
      throw error
    })
  }

  return schemaReady
}

export async function recordEvent(input: {
  actorUserId: string
  actorRole: string
  action: string
  objectType: string
  objectId: string
  payload?: Record<string, unknown>
}) {
  await db.insert(cpEvent).values({
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    payload: input.payload ?? {},
  })
}

export type ControlPlaneState = {
  roles: CpRole[]
  objectives: CpObjective[]
  work: CpWorkItem[]
  handoffs: CpHandoff[]
  decisions: CpDecision[]
  events: CpEvent[]
}

export async function getControlPlaneState(): Promise<ControlPlaneState> {
  await ensureControlPlaneSchema()
  const [roles, objectives, work, handoffs, decisions, events] = await Promise.all([
    db.select().from(cpRole).orderBy(asc(cpRole.sortOrder)),
    db.select().from(cpObjective).orderBy(desc(cpObjective.updatedAt)),
    db.select().from(cpWorkItem).orderBy(desc(cpWorkItem.updatedAt)),
    db.select().from(cpHandoff).orderBy(desc(cpHandoff.updatedAt)),
    db.select().from(cpDecision).orderBy(desc(cpDecision.createdAt)).limit(30),
    db.select().from(cpEvent).orderBy(desc(cpEvent.createdAt)).limit(40),
  ])

  return { roles, objectives, work, handoffs, decisions, events }
}

export async function getRoleStation(roleSlug: string) {
  await ensureControlPlaneSchema()
  const [role] = await db.select().from(cpRole).where(eq(cpRole.slug, roleSlug)).limit(1)
  if (!role) return null

  const [ownedWork, incomingHandoffs, recentDecisions] = await Promise.all([
    db
      .select()
      .from(cpWorkItem)
      .where(and(eq(cpWorkItem.ownerRole, roleSlug), ne(cpWorkItem.status, 'done')))
      .orderBy(desc(cpWorkItem.updatedAt)),
    db
      .select()
      .from(cpHandoff)
      .where(and(eq(cpHandoff.toRole, roleSlug), eq(cpHandoff.status, 'open')))
      .orderBy(desc(cpHandoff.updatedAt)),
    db
      .select()
      .from(cpDecision)
      .where(eq(cpDecision.ownerRole, roleSlug))
      .orderBy(desc(cpDecision.createdAt))
      .limit(8),
  ])

  return { role, ownedWork, incomingHandoffs, recentDecisions }
}

export function buildRoleBrief(input: {
  role: CpRole
  ownedWork: CpWorkItem[]
  incomingHandoffs: CpHandoff[]
  recentDecisions: CpDecision[]
}) {
  const workLines = input.ownedWork.length
    ? input.ownedWork.map((item) => `- ${workId(item.id)} [${item.status}/${item.priority}] ${item.title}\n  Next: ${item.nextAction || 'Not recorded'}`).join('\n')
    : '- No active owned work.'
  const handoffLines = input.incomingHandoffs.length
    ? input.incomingHandoffs.map((item) => `- ${handoffId(item.id)} from ${item.fromRole}: ${item.summary}\n  Required output: ${item.requiredOutput || 'Not specified'}`).join('\n')
    : '- No open incoming handoffs.'
  const decisionLines = input.recentDecisions.length
    ? input.recentDecisions.map((item) => `- ${decisionId(item.id)} ${item.title}: ${item.decision}`).join('\n')
    : '- No role-owned decisions recorded yet.'

  return `${input.role.title} — ${input.role.name}\n\nMISSION\n${input.role.mission}\n\nAUTHORITY\n${input.role.authority}\n\nRESTRICTIONS\n${input.role.restrictions}\n\nACTIVE WORK\n${workLines}\n\nINCOMING HANDOFFS\n${handoffLines}\n\nRECENT DECISIONS\n${decisionLines}\n\nOPERATING RULE\nRead this station first. Work from recorded state. Distinguish assumptions from evidence. Record material decisions and leave a handoff when responsibility moves.`
}
