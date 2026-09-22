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
  street1?: string
  street2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

type ShippoAddressList = {
  results?: ShippoAddress[]
}

function physicalAddressKey(address: ShippoAddress) {
  return [
    address.street1,
    address.street2,
    address.city,
    address.state,
    address.zip,
    address.country,
  ]
    .map((value) =>
      (value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\broad\b/g, 'rd')
        .replace(/\bstreet\b/g, 'st')
        .replace(/\bavenue\b/g, 'ave')
        .replace(/\s+/g, ' '),
    )
    .join('|')
}

export async function resolveShippoOriginAddressId() {
  const explicit = process.env.SHIPPO_FROM_ADDRESS_ID?.trim()
  if (explicit) return explicit

  const data = await shippoRequest<ShippoAddressList>('/addresses/?results=100')
  const domestic = (data.results ?? []).filter(
    (address) => (address.country ?? '').toUpperCase() === 'US',
  )

  if (!domestic.length) {
    throw new Error('No US address was found in Shippo.')
  }

  const groups = new Map<string, ShippoAddress[]>()
  for (const address of domestic) {
    const key = physicalAddressKey(address)
    const group = groups.get(key) ?? []
    group.push(address)
    groups.set(key, group)
  }

  const ranked = [...groups.values()].sort((a, b) => b.length - a.length)

  if (ranked.length === 1 || ranked[0].length > ranked[1].length) {
    return ranked[0][0].object_id
  }

  throw new Error(
    'Auction Console found more than one possible Shippo sender address and could not choose safely.',
  )
}
