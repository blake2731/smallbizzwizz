import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db, profile, conversation } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Checks = {
  hasDatabaseUrl: boolean
  databaseHost?: string
  connection?: 'ok' | 'failed'
  connectionError?: string
  profileTable?: 'ok' | 'missing' | 'error'
  profileError?: string
  profileColumns?: string[]
  conversationTable?: 'ok' | 'missing' | 'error'
  conversationError?: string
  hasOnboardingCompleted?: boolean
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export async function GET(req: NextRequest) {
  const expected = process.env.HEALTHCHECK_TOKEN
  if (!expected) {
    return NextResponse.json({ error: 'Healthcheck disabled' }, { status: 404 })
  }
  const provided = req.nextUrl.searchParams.get('token') ?? ''
  if (!timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const checks: Checks = { hasDatabaseUrl: Boolean(process.env.DATABASE_URL) }

  if (process.env.DATABASE_URL) {
    try {
      checks.databaseHost = new URL(process.env.DATABASE_URL).host
    } catch {
      checks.databaseHost = 'unparseable'
    }
  }

  if (!checks.hasDatabaseUrl) {
    return NextResponse.json({ ok: false, ...checks }, { status: 500 })
  }

  try {
    await db.execute(sql`SELECT 1`)
    checks.connection = 'ok'
  } catch (e) {
    checks.connection = 'failed'
    checks.connectionError = errorMessage(e)
    return NextResponse.json({ ok: false, ...checks }, { status: 500 })
  }

  try {
    await db.select({ userId: profile.userId }).from(profile).limit(1)
    checks.profileTable = 'ok'
  } catch (e) {
    const msg = errorMessage(e)
    checks.profileTable = /does not exist/i.test(msg) ? 'missing' : 'error'
    checks.profileError = msg
  }

  try {
    await db.select({ id: conversation.id }).from(conversation).limit(1)
    checks.conversationTable = 'ok'
  } catch (e) {
    const msg = errorMessage(e)
    checks.conversationTable = /does not exist/i.test(msg) ? 'missing' : 'error'
    checks.conversationError = msg
  }

  try {
    const result = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'profile' ORDER BY ordinal_position`,
    )
    const rows = (result as unknown as { rows?: Array<{ column_name: string }> }).rows
      ?? (result as unknown as Array<{ column_name: string }>)
    const cols = Array.isArray(rows) ? rows.map((r) => r.column_name) : []
    checks.profileColumns = cols
    checks.hasOnboardingCompleted = cols.includes('onboarding_completed')
  } catch (e) {
    checks.profileError = (checks.profileError ?? '') + ' | schema: ' + errorMessage(e)
  }

  const ok =
    checks.connection === 'ok' &&
    checks.profileTable === 'ok' &&
    checks.conversationTable === 'ok' &&
    checks.hasOnboardingCompleted === true

  return NextResponse.json({ ok, ...checks }, { status: ok ? 200 : 500 })
}
