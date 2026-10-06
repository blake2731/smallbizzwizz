import { auth } from '@clerk/nextjs/server'
import { neon } from '@neondatabase/serverless'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'feature/private-invoices') throw new Error()
    const raw = process.env.DATABASE_URL
    if (!raw) throw new Error()
    const url = new URL(raw)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['ep-withered-queen-aqf01v2f.c-8.us-east-1.aws.neon.tech', 'ep-withered-queen-aqf01v2f-pooler.c-8.us-east-1.aws.neon.tech'].includes(url.hostname) ||
      decodeURIComponent(url.pathname.slice(1)) !== 'auction_invoice_sandbox') throw new Error()
    const query = neon(raw)
    const rows = await query`SELECT current_database() AS database`
    if (rows.length !== 1 || rows[0].database !== 'auction_invoice_sandbox') throw new Error()
    return Response.json({ environment: 'preview', branch: 'feature/private-invoices', database: rows[0].database,
      owner: userId, paypalEnabled: process.env.AUCTION_PAYPAL_CHECKOUT_ENABLED === 'true',
      paypalWritesEnabled: process.env.PAYPAL_WRITES_ENABLED === 'true' },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
  } catch {
    return Response.json({ error: 'Sandbox database verification failed' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
