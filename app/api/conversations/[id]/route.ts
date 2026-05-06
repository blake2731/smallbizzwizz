import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db, conversation, message } from '@/lib/db'
import { and, eq, asc } from 'drizzle-orm'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const [conv] = await db
    .select({ id: conversation.id, title: conversation.title })
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .limit(1)

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messages = await db
    .select({
      role: message.role,
      content: message.content,
      attachmentName: message.attachmentName,
    })
    .from(message)
    .where(eq(message.conversationId, id))
    .orderBy(asc(message.createdAt))

  return NextResponse.json({
    id: conv.id,
    title: conv.title,
    messages,
  })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const result = await db
    .delete(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .returning({ id: conversation.id })

  if (result.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}
