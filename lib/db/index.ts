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
  cached = drizzle(neon(url), { schema })
  return cached
}

export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver)
  },
}) as DB

export * from './schema'
