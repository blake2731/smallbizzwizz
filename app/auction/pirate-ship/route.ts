import { auth } from '@clerk/nextjs/server'
import { getAuctionState } from '@/lib/auction'
import { pirateShipExportResponse } from '@/lib/auction-shipping-export'

export async function GET(request: Request) {
  const userId =
    process.env.VERCEL_ENV === 'preview'
      ? 'auction-preview-owner'
      : (await auth()).userId

  if (!userId) {
    return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const url = new URL(request.url)
  const rawId = url.searchParams.get('auction') ?? ''
  const auctionId = Number(rawId)
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(auctionId) || auctionId <= 0) {
    return new Response('A valid auction is required', { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const state = await getAuctionState(userId, auctionId)
  if (!state) {
    return new Response('Auction not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  return pirateShipExportResponse(state, url.searchParams.get('report') === '1')
}
