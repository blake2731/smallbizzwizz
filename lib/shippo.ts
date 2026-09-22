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
