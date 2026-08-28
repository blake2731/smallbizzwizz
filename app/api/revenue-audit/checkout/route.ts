import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { normalizeAuditUrl } from '@/lib/revenue-audit'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: unknown }
    if (typeof body.url !== 'string') {
      return NextResponse.json({ error: 'Enter a website to continue.' }, { status: 400 })
    }

    const targetUrl = normalizeAuditUrl(body.url)
    const origin = new URL(req.url).origin

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: 4900,
            product_data: {
              name: 'SmallBizzWizz Revenue Fix Pack',
              description: 'Full conversion leak diagnostic, priority order, recovery actions, and implementation templates.',
            },
          },
        },
      ],
      metadata: {
        targetUrl,
        product: 'revenue_fix_pack_v2',
      },
      success_url: `${origin}/audit/report?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?url=${encodeURIComponent(targetUrl)}`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Revenue audit checkout error', error)
    return NextResponse.json({ error: 'Checkout could not be started.' }, { status: 500 })
  }
}
