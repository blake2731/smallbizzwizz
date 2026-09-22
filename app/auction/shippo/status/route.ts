import { auth } from '@clerk/nextjs/server'
import { shippoConfigStatus, shippoRequest } from '@/lib/shippo'

type ShippoAddress = {
  object_id: string
  name?: string
  company?: string
  street1?: string
  street2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  metadata?: string
  validation_results?: {
    is_valid?: boolean
  }
}

type ShippoAddressList = {
  results?: ShippoAddress[]
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    const { userId } = await auth()
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const config = shippoConfigStatus()
  if (!config.configured) {
    return Response.json(
      { ...config, connected: false },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const data = await shippoRequest<ShippoAddressList>('/addresses/?results=20')
    const addresses = (data.results ?? []).map((address) => ({
      id: address.object_id,
      name: address.company || address.name || '',
      city: address.city || '',
      state: address.state || '',
      zip: address.zip || '',
      country: address.country || '',
      metadata: address.metadata || '',
      valid: address.validation_results?.is_valid ?? null,
    }))

    return Response.json(
      {
        ...config,
        connected: true,
        addressCount: addresses.length,
        addresses,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return Response.json(
      {
        ...config,
        connected: false,
        error: error instanceof Error ? error.message : 'Shippo connection failed.',
      },
      {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }
}
