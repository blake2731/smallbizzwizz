import { auth } from '@clerk/nextjs/server'
import { shopifyConfigStatus } from '@/lib/shopify-admin'

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    const { userId } = await auth()
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return Response.json(shopifyConfigStatus(), {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
