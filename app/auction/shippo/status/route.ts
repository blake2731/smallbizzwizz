import { auth } from '@clerk/nextjs/server'
import {
  resolveShippoOriginAddressId,
  shippoConfigStatus,
} from '@/lib/shippo'

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
      { ...config, connected: false, originResolved: false },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    await resolveShippoOriginAddressId()

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
        error: error instanceof Error ? error.message : 'Shippo origin resolution failed.',
      },
      {
        status: 409,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }
}
