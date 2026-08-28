import { NextRequest, NextResponse } from 'next/server'
import { auditWebsite } from '@/lib/revenue-audit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Expected a JSON request.' }, { status: 415 })
    }

    const origin = req.headers.get('origin')
    const expectedOrigin = new URL(req.url).origin
    if (origin && origin !== expectedOrigin) {
      return NextResponse.json({ error: 'Cross-site scan requests are not allowed.' }, { status: 403 })
    }

    const body = (await req.json()) as { url?: unknown }
    if (typeof body.url !== 'string') {
      return NextResponse.json({ error: 'Enter a business website to scan.' }, { status: 400 })
    }

    const result = await auditWebsite(body.url)
    return NextResponse.json(result, {
      headers: {
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to scan that website.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
