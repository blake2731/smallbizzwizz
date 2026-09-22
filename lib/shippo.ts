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


type ShippoAddressBookEntry = {
  id: string
  address: {
    name?: string
    organization?: string
    address_line_1?: string
    address_line_2?: string
    city_locality?: string
    state_province?: string
    postal_code?: string
    country_code?: string
  }
  created_at?: string
  updated_at?: string
}

type ShippoAddressBookList = {
  count?: number
  results?: ShippoAddressBookEntry[]
}

export async function getShippoAddressBook() {
  return shippoRequest<ShippoAddressBookList>('/v2/addresses?offset=0&limit=100', {
    headers: {
      Accept: 'application/json',
    },
  })
}

export async function resolveShippoOriginAddressId() {
  const explicit = process.env.SHIPPO_FROM_ADDRESS_ID?.trim()
  if (explicit) return explicit

  const data = await getShippoAddressBook()
  const domestic = (data.results ?? []).filter(
    (entry) => (entry.address.country_code ?? '').toUpperCase() === 'US',
  )

  if (domestic.length === 1) {
    return domestic[0].id
  }

  const uniquePhysicalAddresses = new Map<string, ShippoAddressBookEntry>()
  for (const entry of domestic) {
    const address = entry.address
    const key = [
      address.address_line_1,
      address.address_line_2,
      address.city_locality,
      address.state_province,
      address.postal_code,
      address.country_code,
    ]
      .map((value) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
      .join('|')

    if (!uniquePhysicalAddresses.has(key)) {
      uniquePhysicalAddresses.set(key, entry)
    }
  }

  if (uniquePhysicalAddresses.size === 1) {
    return [...uniquePhysicalAddresses.values()][0].id
  }

  const likely = domestic.filter((entry) => {
    const haystack = [
      entry.address.organization,
      entry.address.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes('crafty brother')
  })

  if (likely.length === 1) {
    return likely[0].id
  }

  if (!domestic.length) {
    throw new Error('No US sender address was found in the Shippo address book.')
  }

  throw new Error(
    'More than one Shippo sender address is saved. Choose the Auction Console sender address once and it will be reused.',
  )
}
