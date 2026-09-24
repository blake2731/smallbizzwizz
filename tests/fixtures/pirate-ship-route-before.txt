import { auth } from '@clerk/nextjs/server'
import { getAuctionState } from '@/lib/auction'

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value)
  return '"' + text.replace(/"/g, '""') + '"'
}

function dimension(hundredths: number | null) {
  return hundredths === null ? '' : String(hundredths / 100)
}

export async function GET(request: Request) {
  const userId =
    process.env.VERCEL_ENV === 'preview'
      ? 'auction-preview-owner'
      : (await auth()).userId

  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(request.url)
  const auctionId = Number.parseInt(url.searchParams.get('auction') ?? '', 10)
  if (!Number.isFinite(auctionId)) {
    return new Response('Auction is required', { status: 400 })
  }

  const state = await getAuctionState(userId, auctionId)
  if (!state) {
    return new Response('Auction not found', { status: 404 })
  }

  const headers = [
    'Name',
    'Address Line 1',
    'Address Line 2',
    'City',
    'State',
    'Zip',
    'Country',
    'Email',
    'Phone',
    'Pounds',
    'Ounces',
    'Length',
    'Width',
    'Height',
    'Order ID',
    'Order Value',
    'Note',
  ]

  const readyBuyers = state.buyers.filter((buyer) => {
    const profile = buyer.shippingProfile
    return (
      buyer.packageStatus === 'packed' &&
      Boolean(profile?.address1 && profile.city && profile.state && profile.postalCode) &&
      buyer.packageWeightOunces !== null &&
      buyer.packageWeightOunces > 0 &&
      buyer.packageLengthHundredths !== null &&
      buyer.packageWidthHundredths !== null &&
      buyer.packageHeightHundredths !== null
    )
  })

  if (!readyBuyers.length) {
    return new Response(
      'No packages are ready to export. Save the customer address, weight, dimensions, and mark the package packed first.',
      { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  const rows = readyBuyers.map((buyer) => {
    const profile = buyer.shippingProfile
    const totalOunces = buyer.packageWeightOunces
    const pounds = totalOunces === null ? '' : Math.floor(totalOunces / 16)
    const ounces = totalOunces === null ? '' : totalOunces % 16
    const note = buyer.items.map((item) => item.itemName).join('; ')

    return [
      buyer.displayName,
      profile?.address1 ?? '',
      profile?.address2 ?? '',
      profile?.city ?? '',
      profile?.state ?? '',
      profile?.postalCode ?? '',
      profile?.countryCode ?? 'US',
      buyer.email ?? profile?.email ?? '',
      profile?.phone ?? '',
      pounds,
      ounces,
      dimension(buyer.packageLengthHundredths),
      dimension(buyer.packageWidthHundredths),
      dimension(buyer.packageHeightHundredths),
      'auction-' + state.auction.id + '-buyer-' + buyer.id,
      (buyer.subtotalCents - buyer.discountCents) / 100,
      note,
    ]
  })

  const csv = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\r\n')

  const safeTitle = state.auction.title
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'auction'

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + safeTitle + '-pirate-ship.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
