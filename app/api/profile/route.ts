import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, profile } from '@/lib/db'
import { eq } from 'drizzle-orm'

type ProfilePayload = {
  name: string | null
  businessType: string | null
  businessDuration: string | null
  teamSize: string | null
  biggestStressor: string | null
  onboardingCompleted: boolean
  onboardedAt: string | Date | null
}

function emptyProfile(): ProfilePayload {
  return {
    name: null,
    businessType: null,
    businessDuration: null,
    teamSize: null,
    biggestStressor: null,
    onboardingCompleted: false,
    onboardedAt: null,
  }
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (!row) return NextResponse.json(emptyProfile())

  return NextResponse.json({
    name: row.name,
    businessType: row.businessType,
    businessDuration: row.businessDuration,
    teamSize: row.teamSize,
    biggestStressor: row.biggestStressor,
    onboardingCompleted: row.onboardingCompleted,
    onboardedAt: row.onboardedAt,
  })
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, max)
  return trimmed || null
}

export async function PATCH(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const now = new Date()

  const updates: {
    name?: string | null
    businessType?: string | null
    businessDuration?: string | null
    teamSize?: string | null
    biggestStressor?: string | null
    onboardingCompleted?: boolean
    onboardedAt: Date
  } = { onboardedAt: now }

  if ('name' in body) updates.name = cleanString(body.name, 200)
  if ('businessType' in body) updates.businessType = cleanString(body.businessType, 100)
  if ('businessDuration' in body) updates.businessDuration = cleanString(body.businessDuration, 200)
  if ('teamSize' in body) updates.teamSize = cleanString(body.teamSize, 200)
  if ('biggestStressor' in body) updates.biggestStressor = cleanString(body.biggestStressor, 2000)
  if ('onboardingCompleted' in body) updates.onboardingCompleted = Boolean(body.onboardingCompleted)

  const [saved] = await db
    .insert(profile)
    .values({
      userId,
      name: updates.name ?? null,
      businessType: updates.businessType ?? null,
      businessDuration: updates.businessDuration ?? null,
      teamSize: updates.teamSize ?? null,
      biggestStressor: updates.biggestStressor ?? null,
      onboardingCompleted: updates.onboardingCompleted ?? false,
      onboardedAt: now,
    })
    .onConflictDoUpdate({
      target: profile.userId,
      set: updates,
    })
    .returning()

  return NextResponse.json({
    name: saved.name,
    businessType: saved.businessType,
    businessDuration: saved.businessDuration,
    teamSize: saved.teamSize,
    biggestStressor: saved.biggestStressor,
    onboardingCompleted: saved.onboardingCompleted,
    onboardedAt: saved.onboardedAt,
  })
}
