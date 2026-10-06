const { neon } = require('@neondatabase/serverless')

const expected = {
  branch: 'feature/private-invoices',
  database: 'auction_invoice_sandbox',
  hosts: ['ep-withered-queen-aqf01v2f.c-8.us-east-1.aws.neon.tech', 'ep-withered-queen-aqf01v2f-pooler.c-8.us-east-1.aws.neon.tech'],
}

async function main() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== expected.branch) {
    throw new Error('Sandbox deployment environment mismatch')
  }
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('Sandbox database configuration missing')
  const url = new URL(raw)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !expected.hosts.includes(url.hostname) ||
      decodeURIComponent(url.pathname.slice(1)) !== expected.database) {
    throw new Error('Sandbox database target mismatch')
  }
  const query = neon(raw)
  const rows = await query`SELECT current_database() AS database`
  if (rows.length !== 1 || rows[0].database !== expected.database) throw new Error('Sandbox database identity mismatch')
  console.log('SANDBOX_DATABASE_VERIFIED ' + JSON.stringify({ environment: 'preview', branch: expected.branch, database: rows[0].database, endpoint: url.hostname, readOnly: true }))
}

main().catch(() => { console.error('Sandbox database verification failed; build aborted. Credential and provider errors suppressed.'); process.exitCode = 1 })
