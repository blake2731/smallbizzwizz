import { auth, currentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { and, asc, eq } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import { db, conversation, message, profile } from '@/lib/db'
import { BUSINESS_CONTEXTS } from '@/lib/industry-contexts'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are SmallBizzWizz — a direct, experienced business advisor for small business owners, freelancers, and solo operators.

Your job is to be the knowledgeable friend they never had: someone who has seen hundreds of businesses, knows how deals work, understands money, and gives real answers — not hedged consultant-speak.

How you respond
- Lead with the answer. Never bury it at the end.
- Be direct ("yes, that's a red flag" / "no, that's normal").
- Plain language, no jargon unless explained.
- Tight responses: 3–5 sentences for simple questions, short paragraphs for complex ones.
- End with one clear next step when relevant.

Areas of expertise: pricing, evaluating deals/acquisitions, contract red flags, client acquisition, cash flow & margins, hiring/firing, when to quit/pivot, family business dynamics, marketing copy, promotional content, customer-facing writing, social media captions, product descriptions, and business emails.

Writing tasks: when asked to write something — a promo post, a payment chaser email, a product description, a social media caption, a refund response — just write it. Don't explain that you're going to write it, don't ask clarifying questions unless truly essential. Just produce it, tailored to their business.

What you never do: say "consult a professional" as the main answer, give three-sided answers, use corporate jargon (leverage, synergize, circle back), pad with "Great question!", pretend not to have an opinion, or tell a small business owner that a reasonable business task is "outside your lane."

Tone: smart friend who has built and sold businesses. Warm but not soft. Confident but not arrogant. Honest even when it stings.

Limits: not a licensed attorney/accountant — flag when a professional is essential, but still give your read first.`

const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel',
  'text/csv',
])

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

const allowedTypes = [
  'application/pdf',
  ...SPREADSHEET_MIME_TYPES,
  ...IMAGE_MIME_TYPES,
]

// Trimmed to keep the prompt within reasonable token budgets.
const SPREADSHEET_TEXT_LIMIT = 60_000

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

type Attachment = {
  name: string
  mediaType: string
  data: string
}

function spreadsheetToText(base64: string, fileName: string): string {
  try {
    const buffer = Buffer.from(base64, 'base64')
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sections: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim()
      if (!csv) continue
      sections.push(`=== Sheet: ${sheetName} ===\n${csv}`)
    }

    if (sections.length === 0) {
      return `[Spreadsheet attachment: ${fileName} — file was empty or unreadable.]`
    }

    let body = sections.join('\n\n')
    let truncated = false
    if (body.length > SPREADSHEET_TEXT_LIMIT) {
      body = body.slice(0, SPREADSHEET_TEXT_LIMIT)
      truncated = true
    }

    const header = `[Spreadsheet attachment: ${fileName}${truncated ? ' — truncated for length' : ''}]`
    return `${header}\n\n${body}`
  } catch (error) {
    return `[Spreadsheet attachment: ${fileName} — failed to parse (${error instanceof Error ? error.message : 'unknown error'}).]`
  }
}

function deriveTitle(userMessage: string, attachmentName: string | null): string {
  const source = userMessage.trim() || attachmentName || 'New chat'
  return source.length > 50 ? source.slice(0, 50) + '…' : source
}

async function buildSystemPrompt(userId: string): Promise<string> {
  const [row] = await db
    .select({
      name: profile.name,
      businessType: profile.businessType,
      businessDuration: profile.businessDuration,
      teamSize: profile.teamSize,
      biggestStressor: profile.biggestStressor,
    })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (!row) return SYSTEM_PROMPT

  const profileLines: string[] = []
  if (row.name) profileLines.push(`User's name: ${row.name}`)
  if (row.businessType) profileLines.push(`Business type: ${row.businessType}`)
  if (row.businessDuration) profileLines.push(`How long they've run it: ${row.businessDuration}`)
  if (row.teamSize) profileLines.push(`Team situation: ${row.teamSize}`)
  if (row.biggestStressor) profileLines.push(`What they first told me was stressing them out: ${row.biggestStressor}`)

  let augmented = SYSTEM_PROMPT
  if (profileLines.length > 0) {
    augmented += `\n\nAbout this user:\n${profileLines.join('\n')}`
  }
  if (row.businessType && BUSINESS_CONTEXTS[row.businessType]) {
    augmented += `\n\n${BUSINESS_CONTEXTS[row.businessType]}`
  }
  return augmented
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await currentUser()
  if (!user?.publicMetadata?.subscribed) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
  }

  const body = await req.json()
  const userMessage: string = typeof body?.message === 'string' ? body.message : ''
  const incomingConvId: string | null = typeof body?.conversationId === 'string' ? body.conversationId : null
  const attachment: Attachment | undefined = body?.attachment

  if (!userMessage.trim() && !attachment) {
    return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  }

  if (attachment) {
    if (!allowedTypes.includes(attachment.mediaType)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }
    // base64 is ~4/3× raw; 13.4MB base64 ≈ 10MB raw
    if (typeof attachment.data === 'string' && attachment.data.length > 13_400_000) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }
  }

  let convId: string
  if (incomingConvId) {
    const [existing] = await db
      .select({ id: conversation.id })
      .from(conversation)
      .where(and(eq(conversation.id, incomingConvId), eq(conversation.userId, userId)))
      .limit(1)
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    convId = existing.id
  } else {
    const title = deriveTitle(userMessage, attachment?.name ?? null)
    const [created] = await db
      .insert(conversation)
      .values({ userId, title })
      .returning({ id: conversation.id })
    convId = created.id
  }

  await db.insert(message).values({
    conversationId: convId,
    role: 'user',
    content: userMessage,
    attachmentName: attachment?.name ?? null,
  })

  const dbMessages = await db
    .select({
      role: message.role,
      content: message.content,
    })
    .from(message)
    .where(eq(message.conversationId, convId))
    .orderBy(asc(message.createdAt))

  const claudeMessages = dbMessages.map((m, i) => {
    const isLast = i === dbMessages.length - 1
    if (isLast && attachment && m.role === 'user') {
      const content: ContentBlock[] = []
      if (attachment.mediaType === 'application/pdf') {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: attachment.data },
        })
        content.push({ type: 'text', text: m.content || 'Please review this document.' })
      } else if (IMAGE_MIME_TYPES.has(attachment.mediaType)) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: attachment.mediaType, data: attachment.data },
        })
        content.push({ type: 'text', text: m.content || 'Please review this image.' })
      } else if (SPREADSHEET_MIME_TYPES.has(attachment.mediaType)) {
        const sheetText = spreadsheetToText(attachment.data, attachment.name)
        const userText = m.content || 'Please review this spreadsheet.'
        content.push({ type: 'text', text: `${sheetText}\n\n---\n\n${userText}` })
      } else {
        content.push({ type: 'text', text: m.content })
      }
      return { role: 'user' as const, content }
    }
    return { role: m.role, content: m.content }
  })

  const systemPrompt = await buildSystemPrompt(userId)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: claudeMessages as any,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  await db.insert(message).values({
    conversationId: convId,
    role: 'assistant',
    content: text,
  })

  await db
    .update(conversation)
    .set({ updatedAt: new Date() })
    .where(eq(conversation.id, convId))

  return NextResponse.json({ message: text, conversationId: convId })
}
