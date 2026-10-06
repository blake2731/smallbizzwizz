import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

type DB = NeonHttpDatabase<typeof schema>

let cached: DB | null = null

function getDb(): DB {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env.local for local dev, ' +
        'and to Vercel → Project → Settings → Environment Variables ' +
        '(Production, Preview, Development) for deployments.',
    )
  }
  if (process.env.VERCEL_GIT_COMMIT_REF === 'feature/private-invoices') {
    const target = new URL(url)
    if (process.env.VERCEL_ENV !== 'preview' ||
        !['ep-withered-queen-aqf01v2f.c-8.us-east-1.aws.neon.tech', 'ep-withered-queen-aqf01v2f-pooler.c-8.us-east-1.aws.neon.tech'].includes(target.hostname) ||
        decodeURIComponent(target.pathname.slice(1)) !== 'auction_invoice_sandbox') {
      throw new Error('Sandbox database target mismatch')
    }
  }
  cached = drizzle(neon(url), { schema })
  return cached
}

export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver)
  },
}) as DB

export * from './schema'
