import { auth } from '@clerk/nextjs/server'
import { getShippoAddressBook, shippoConfigStatus } from '@/lib/shippo'

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
    const data = await getShippoAddressBook()
    const addresses = (data.results ?? []).map((entry) => ({
      id: entry.id,
      name: entry.address.organization || entry.address.name || '',
      street1: entry.address.address_line_1 || '',
      street2: entry.address.address_line_2 || '',
      city: entry.address.city_locality || '',
      state: entry.address.state_province || '',
      zip: entry.address.postal_code || '',
      country: entry.address.country_code || '',
    }))

    return Response.json(
      {
        ...config,
        connected: true,
        addressCount: data.count ?? addresses.length,
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
