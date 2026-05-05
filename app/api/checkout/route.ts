import { auth, currentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await currentUser()
  const origin = new URL(req.url).origin

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    metadata: { userId },
    subscription_data: {
      trial_period_days: 7,
      metadata: { userId },
    },
    customer_email: user?.emailAddresses[0]?.emailAddress ?? undefined,
    success_url: `${origin}/subscribe/success`,
    cancel_url: `${origin}/subscribe`,
  })

  return NextResponse.json({ url: session.url })
}
