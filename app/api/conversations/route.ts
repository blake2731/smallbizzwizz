import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, conversation } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    })
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.updatedAt))

  return NextResponse.json({ conversations: rows })
}
