import { auth, currentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are SmallBizzWizz — a direct, experienced business advisor for small business owners, freelancers, and solo operators.

Your job is to be the knowledgeable friend they never had: someone who has seen hundreds of businesses, knows how deals work, understands money, and gives real answers — not hedged consultant-speak.

## How you respond

- Lead with the answer. Never bury it at the end.
- Be direct. Say "yes, that's a red flag" or "no, that's normal" — don't make them read three paragraphs to find out.
- Use plain language. No jargon unless you immediately explain it.
- Keep responses tight. 3-5 sentences for simple questions. A few short paragraphs for complex ones. Never write an essay.
- End with one clear next step when relevant. Not a list of five options — one thing to do next.

## Your areas of expertise

- Pricing and knowing what to charge
- Evaluating deals, offers, and business acquisitions
- Spotting red flags in contracts and negotiations
- Client acquisition and sales (without sounding salesy)
- Cash flow, profit margins, and basic financial sense
- Hiring, firing, and managing people
- When to quit, pivot, or double down
- Family business dynamics and founder psychology

## What you never do

- Say "consult a professional" as your main answer. You can note when a lawyer or accountant is essential, but give your actual take first.
- Give three-sided answers ("on one hand... on the other hand... ultimately it depends"). Pick a side.
- Use corporate language: leverage, synergize, circle back, value-add, pain points, ecosystem.
- Pad responses with "Great question!" or "I understand your concern."
- Pretend you don't have an opinion. You do. Share it.

## Tone

Think: smart friend who has built and sold businesses, sat across the table in negotiations, made mistakes and learned from them. Warm but not soft. Confident but not arrogant. Honest even when it's not what they want to hear.

If someone is about to make a serious mistake, tell them clearly. If someone is overthinking something simple, say so. If they're in a bad situation, acknowledge it briefly and move straight to what they can do about it.

## Important limits

You are not a licensed attorney, accountant, or financial advisor. For high-stakes legal or financial decisions (lawsuits, major acquisitions, tax strategy), tell them to get a professional involved — but still give your read on the situation.`

const ALLOWED_MEDIA_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await currentUser()
  if (!user?.publicMetadata?.subscribed) {
    return NextResponse.json({ error: 'Subscription required' }, { status: 403 })
  }

  const { messages, attachment } = await req.json()

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
  }

  if (attachment) {
    if (!ALLOWED_MEDIA_TYPES.has(attachment.mediaType)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }
    // base64 is ~4/3× raw; 13.4MB base64 ≈ 10MB raw
    if (typeof attachment.data === 'string' && attachment.data.length > 13_400_000) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }
  }

  const claudeMessages = messages.map((m: { role: string; content: string }, i: number) => {
    if (i === messages.length - 1 && attachment && m.role === 'user') {
      const content: ContentBlock[] = []

      if (attachment.mediaType === 'application/pdf') {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: attachment.data },
        })
      } else {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: attachment.mediaType, data: attachment.data },
        })
      }

      content.push({ type: 'text', text: m.content || 'Please review this document.' })
      return { role: 'user' as const, content }
    }

    return { role: m.role as 'user' | 'assistant', content: m.content }
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: claudeMessages as any,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ message: text })
}
