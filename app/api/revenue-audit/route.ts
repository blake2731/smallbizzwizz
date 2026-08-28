import { NextRequest, NextResponse } from 'next/server'
import { auditWebsite } from '@/lib/revenue-audit'

export const runtime = 'nodejs'

function response(result: unknown) {
  return NextResponse.json(result, {
    headers: {
      'cache-control': 'no-store',
    },
  })
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to scan that website.'
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get('url')
    if (!url) return NextResponse.json({ error: 'Add a url query parameter.' }, { status: 400 })
    return response(await auditWebsite(url))
  } catch (error) {
    return errorResponse(error)
  }
}

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

    return response(await auditWebsite(body.url))
  } catch (error) {
    return errorResponse(error)
  }
}
