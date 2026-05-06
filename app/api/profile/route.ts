import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, profile } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (!row) {
    return NextResponse.json({ name: null, businessType: null, onboardedAt: null })
  }

  return NextResponse.json({
    name: row.name,
    businessType: row.businessType,
    onboardedAt: row.onboardedAt,
  })
}

export async function PATCH(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const now = new Date()

  const updates: { name?: string | null; businessType?: string | null; onboardedAt: Date } = {
    onboardedAt: now,
  }

  if ('name' in body) {
    const raw = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
    updates.name = raw || null
  }
  if ('businessType' in body) {
    const raw = typeof body.businessType === 'string' ? body.businessType.trim().slice(0, 100) : ''
    updates.businessType = raw || null
  }

  const [saved] = await db
    .insert(profile)
    .values({
      userId,
      name: updates.name ?? null,
      businessType: updates.businessType ?? null,
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
    onboardedAt: saved.onboardedAt,
  })
}
