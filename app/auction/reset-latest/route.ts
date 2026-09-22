import { NextResponse } from 'next/server'
import { resetLatestAuctionPreview } from '@/lib/auction-preview-seed'

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse('Preview only', { status: 404 })
  }

  const auctionId = await resetLatestAuctionPreview('auction-preview-owner')
  const url = new URL('/auction', request.url)
  url.searchParams.set('auction', String(auctionId))
  url.searchParams.set('view', 'live')
  return NextResponse.redirect(url)
}
