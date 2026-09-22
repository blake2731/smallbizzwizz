type ShippoErrorDetail = {
  message?: string
  detail?: string
}

function shippoToken() {
  const token = process.env.SHIPPO_API_TOKEN?.trim()
  if (!token) throw new Error('Shippo API token is not configured.')
  return token
}

export function shippoConfigStatus() {
  return {
    configured: Boolean(process.env.SHIPPO_API_TOKEN?.trim()),
  }
}

export async function shippoRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch('https://api.goshippo.com' + path, {
    ...init,
    headers: {
      Authorization: 'ShippoToken ' + shippoToken(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })

  const text = await response.text()
  let payload: unknown = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    let message = 'Shippo request failed with HTTP ' + response.status + '.'
    if (typeof payload === 'string' && payload.trim()) {
      message = payload.trim()
    } else if (payload && typeof payload === 'object') {
      const detail = payload as ShippoErrorDetail
      message = detail.detail || detail.message || message
    }
    throw new Error(message)
  }

  return payload as T
}


type ShippoAddress = {
  object_id: string
  name?: string
  company?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  metadata?: string
}

type ShippoAddressList = {
  results?: ShippoAddress[]
}

export async function resolveShippoOriginAddressId() {
  const explicit = process.env.SHIPPO_FROM_ADDRESS_ID?.trim()
  if (explicit) return explicit

  const data = await shippoRequest<ShippoAddressList>('/addresses/?results=100')
  const domestic = (data.results ?? []).filter(
    (address) => (address.country ?? '').toUpperCase() === 'US',
  )

  if (domestic.length === 1) {
    return domestic[0].object_id
  }

  const likely = domestic.filter((address) => {
    const haystack = [
      address.company,
      address.name,
      address.metadata,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes('crafty brother') || haystack.includes('ship from')
  })

  if (likely.length === 1) {
    return likely[0].object_id
  }

  if (!domestic.length) {
    throw new Error('No US ship from address was found in Shippo.')
  }

  throw new Error(
    'More than one Shippo ship from address is available. Set SHIPPO_FROM_ADDRESS_ID to the one Auction Console should use.',
  )
}
