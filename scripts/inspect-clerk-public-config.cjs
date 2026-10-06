async function main() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'feature/private-invoices') throw new Error()
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
  const type = key.startsWith('pk_live_') ? 'production' : key.startsWith('pk_test_') ? 'development' : 'invalid'
  const encoded = key.split('_').slice(2).join('_')
  const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '')
  if (!/^[a-z0-9.-]+$/i.test(host) || !host.includes('.')) throw new Error()
  console.log('CLERK_PUBLIC_CONFIG ' + JSON.stringify({ type, frontendApiHost: host, previewHost: process.env.VERCEL_URL }))
  const origin = 'https://' + process.env.VERCEL_URL
  const result = await fetch('https://' + host + '/v1/environment', {
    headers: { Origin: origin, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
  })
  let body
  try { body = await result.json() } catch { body = {} }
  console.log('CLERK_PUBLIC_ENVIRONMENT ' + JSON.stringify({ status: result.status,
    errorCodes: Array.isArray(body.errors) ? body.errors.map(e => e.code).filter(c=>typeof c === 'string' && /^[a-z0-9_-]{1,100}$/i.test(c)) : [] }))
}
main().catch(() => console.log('CLERK_PUBLIC_DIAGNOSTIC_UNAVAILABLE: no response data or credentials logged'))
