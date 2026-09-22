import { resolveShippoOriginAddressId, shippoRequest } from '@/lib/shippo'

type ProbeResponse = {
  object_id: string
  rates?: Array<{
    object_id: string
    amount: string
    currency: string
    provider: string
    servicelevel?: {
      name?: string
    }
  }>
  messages?: Array<{
    text?: string
  }>
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const origin = await resolveShippoOriginAddressId()
    const shipment = await shippoRequest<ProbeResponse>('/shipments/', {
      method: 'POST',
      body: JSON.stringify({
        address_from: origin,
        address_to: {
          name: 'Rate Probe',
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

    return Response.json({
      ok: true,
      rateCount: rates.length,
      cheapest: rates.slice(0, 5),
      messages: (shipment.messages ?? []).map((message) => message.text).filter(Boolean),
    })
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Probe failed.',
      },
      { status: 502 },
    )
  }
}
