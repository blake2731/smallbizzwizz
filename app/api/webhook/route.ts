import { clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.userId

    // Grant access for both paid and trial checkouts (trial has payment_status 'no_payment_required')
    if (userId && session.subscription) {
      const clerk = await clerkClient()
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: {
          subscribed: true,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
        },
      })
    }
  }

  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription
    const shouldRevoke =
      event.type === 'customer.subscription.deleted' ||
      subscription.status === 'canceled' ||
      subscription.status === 'unpaid'

    if (shouldRevoke) {
      const userId = subscription.metadata?.userId
      if (userId) {
        const clerk = await clerkClient()
        await clerk.users.updateUserMetadata(userId, {
          publicMetadata: { subscribed: false },
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}
