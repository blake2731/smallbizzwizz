import { auth, currentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

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
