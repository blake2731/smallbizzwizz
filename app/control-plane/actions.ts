'use server'

import { auth } from '@clerk/nextjs/server'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import {
  cpDecision,
  cpHandoff,
  cpObjective,
  cpRole,
  cpWorkItem,
} from '@/lib/control-plane-schema'
import {
  decisionId,
  ensureControlPlaneSchema,
  handoffId,
  objectiveId,
  recordEvent,
  workId,
} from '@/lib/control-plane'

const WORK_STATUSES = new Set(['backlog', 'ready', 'active', 'waiting', 'review', 'done'])
const PRIORITIES = new Set(['low', 'medium', 'high', 'critical'])
const RISKS = new Set(['normal', 'high', 'irreversible'])

function field(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function required(formData: FormData, name: string) {
  const value = field(formData, name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

function optionalInt(formData: FormData, name: string) {
  const value = field(formData, name)
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

async function actor(formData: FormData) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')
  await ensureControlPlaneSchema()

  const actorRole = required(formData, 'actorRole')
  const [role] = await db.select({ slug: cpRole.slug }).from(cpRole).where(eq(cpRole.slug, actorRole)).limit(1)
  if (!role) throw new Error('Unknown actor role')

  return { userId, actorRole }
}

export async function createObjective(formData: FormData) {
  const { userId, actorRole } = await actor(formData)
  const title = required(formData, 'title')
  const description = required(formData, 'description')
  const successCriteria = required(formData, 'successCriteria')
  const ownerRole = required(formData, 'ownerRole')

  const [created] = await db
    .insert(cpObjective)
    .values({
      title,
      description,
      successCriteria,
      ownerRole,
      createdBy: userId,
    })
    .returning({ id: cpObjective.id })

  await recordEvent({
    actorUserId: userId,
    actorRole,
    action: 'created',
    objectType: 'objective',
    objectId: objectiveId(created.id),
    payload: { title, ownerRole },
  })

  revalidatePath('/control-plane')
}

export async function createWorkItem(formData: FormData) {
  const { userId, actorRole } = await actor(formData)
  const title = required(formData, 'title')
  const description = field(formData, 'description')
  const ownerRole = required(formData, 'ownerRole')
  const priorityInput = field(formData, 'priority') || 'medium'
  const priority = PRIORITIES.has(priorityInput) ? priorityInput : 'medium'
  const riskInput = field(formData, 'risk') || 'normal'
  const risk = RISKS.has(riskInput) ? riskInput : 'normal'
  const nextAction = field(formData, 'nextAction')
  const objectiveIdValue = optionalInt(formData, 'objectiveId')

  const [created] = await db
    .insert(cpWorkItem)
    .values({
      title,
      description,
      status: 'ready',
      priority,
      ownerRole,
      requesterRole: actorRole,
      objectiveId: objectiveIdValue,
      nextAction,
      risk,
      createdBy: userId,
    })
    .returning({ id: cpWorkItem.id })

  await recordEvent({
    actorUserId: userId,
    actorRole,
    action: 'created',
    objectType: 'work_item',
    objectId: workId(created.id),
    payload: { title, ownerRole, priority, risk },
  })

  revalidatePath('/control-plane')
}

export async function updateWorkStatus(formData: FormData) {
  const { userId, actorRole } = await actor(formData)
  const workItemId = optionalInt(formData, 'workItemId')
  const status = required(formData, 'status')
  if (!workItemId || !WORK_STATUSES.has(status)) throw new Error('Invalid work update')

  const [existing] = await db.select().from(cpWorkItem).where(eq(cpWorkItem.id, workItemId)).limit(1)
  if (!existing) throw new Error('Work item not found')

  await db
    .update(cpWorkItem)
    .set({ status, updatedAt: new Date() })
    .where(eq(cpWorkItem.id, workItemId))

  await recordEvent({
    actorUserId: userId,
    actorRole,
    action: 'status_changed',
    objectType: 'work_item',
    objectId: workId(workItemId),
    payload: { from: existing.status, to: status },
  })

  revalidatePath('/control-plane')
}

export async function createHandoff(formData: FormData) {
  const { userId, actorRole } = await actor(formData)
  const toRole = required(formData, 'toRole')
  const summary = required(formData, 'summary')
  const context = field(formData, 'context')
  const requiredOutput = field(formData, 'requiredOutput')
  const workItemId = optionalInt(formData, 'workItemId')

  if (toRole === actorRole) throw new Error('A handoff must go to another role')

  const [created] = await db
    .insert(cpHandoff)
    .values({
      workItemId,
      fromRole: actorRole,
      toRole,
      summary,
      context,
      requiredOutput,
      createdBy: userId,
    })
    .returning({ id: cpHandoff.id })

  await recordEvent({
    actorUserId: userId,
    actorRole,
    action: 'handed_off',
    objectType: 'handoff',
    objectId: handoffId(created.id),
    payload: { toRole, summary, workItemId: workItemId ? workId(workItemId) : null },
  })

  revalidatePath('/control-plane')
}

export async function acceptHandoff(formData: FormData) {
  const { userId, actorRole } = await actor(formData)
  const handoffValue = optionalInt(formData, 'handoffId')
  if (!handoffValue) throw new Error('Invalid handoff')

  const [handoff] = await db
    .select()
    .from(cpHandoff)
    .where(and(eq(cpHandoff.id, handoffValue), eq(cpHandoff.toRole, actorRole)))
    .limit(1)
  if (!handoff) throw new Error('Handoff not found for this role')

  await db
    .update(cpHandoff)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(cpHandoff.id, handoffValue))

  if (handoff.workItemId) {
    await db
      .update(cpWorkItem)
      .set({ ownerRole: actorRole, status: 'active', updatedAt: new Date() })
      .where(eq(cpWorkItem.id, handoff.workItemId))
  }

  await recordEvent({
    actorUserId: userId,
    actorRole,
    action: 'accepted',
    objectType: 'handoff',
    objectId: handoffId(handoffValue),
    payload: { workItemId: handoff.workItemId ? workId(handoff.workItemId) : null },
  })

  revalidatePath('/control-plane')
}

export async function completeHandoff(formData: FormData) {
  const { userId, actorRole } = await actor(formData)
  const handoffValue = optionalInt(formData, 'handoffId')
  if (!handoffValue) throw new Error('Invalid handoff')

  const [handoff] = await db
    .select()
    .from(cpHandoff)
    .where(and(eq(cpHandoff.id, handoffValue), eq(cpHandoff.toRole, actorRole)))
    .limit(1)
  if (!handoff) throw new Error('Handoff not found for this role')

  await db
    .update(cpHandoff)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(cpHandoff.id, handoffValue))

  await recordEvent({
    actorUserId: userId,
    actorRole,
    action: 'completed',
    objectType: 'handoff',
    objectId: handoffId(handoffValue),
    payload: {},
  })

  revalidatePath('/control-plane')
}

export async function createDecision(formData: FormData) {
  const { userId, actorRole } = await actor(formData)
  const title = required(formData, 'title')
  const decision = required(formData, 'decision')
  const rationale = field(formData, 'rationale')
  const evidence = field(formData, 'evidence')

  const [created] = await db
    .insert(cpDecision)
    .values({
      title,
      decision,
      rationale,
      evidence,
      ownerRole: actorRole,
      createdBy: userId,
    })
    .returning({ id: cpDecision.id })

  await recordEvent({
    actorUserId: userId,
    actorRole,
    action: 'decided',
    objectType: 'decision',
    objectId: decisionId(created.id),
    payload: { title },
  })

  revalidatePath('/control-plane')
}
