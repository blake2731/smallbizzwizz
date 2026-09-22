import { auth } from '@clerk/nextjs/server'
import {
  resolveShippoOriginAddressId,
  shippoConfigStatus,
  shippoRequest,
} from '@/lib/shippo'

type ProbeShipment = {
  rates?: Array<{
    amount: string
    currency: string
    provider: string
    servicelevel?: { name?: string }
  }>
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    const { userId } = await auth()
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const config = shippoConfigStatus()
  if (!config.configured) {
    return Response.json(
      { ...config, connected: false, originResolved: false },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const origin = await resolveShippoOriginAddressId()
    const url = new URL(request.url)

    if (process.env.VERCEL_ENV === 'preview' && url.searchParams.get('probe') === '1') {
      const shipment = await shippoRequest<ProbeShipment>('/shipments/', {
        method: 'POST',
        body: JSON.stringify({
          address_from: origin,
          address_to: {
            name: 'Auction Rate Test',
            street1: '350 5th Ave',
            city: 'New York',
            state: 'NY',
            zip: '10118',
            country: 'US',
            object_purpose: 'PURCHASE',
          },
          parcels: [
            {
              length: '12',
              width: '9',
              height: '2',
              distance_unit: 'in',
              weight: '16',
              mass_unit: 'oz',
            },
          ],
          object_purpose: 'PURCHASE',
          async: false,
        }),
      })

      const rates = (shipment.rates ?? [])
        .map((rate) => ({
          provider: rate.provider,
          service: rate.servicelevel?.name ?? '',
          amount: rate.amount,
          currency: rate.currency,
        }))
        .sort((a, b) => Number(a.amount) - Number(b.amount))

      return Response.json(
        {
          ...config,
          connected: true,
          originResolved: true,
          probeSucceeded: rates.length > 0,
          rateCount: rates.length,
          cheapest: rates.slice(0, 5),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return Response.json(
      {
        ...config,
        connected: true,
        originResolved: true,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return Response.json(
      {
        ...config,
        connected: true,
        originResolved: false,
        error: error instanceof Error ? error.message : 'Shippo connection failed.',
      },
      {
        status: 409,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }
}
