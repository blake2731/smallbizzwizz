type ShopifyConfigStatus = {
  configured: boolean
  storeConfigured: boolean
  clientIdConfigured: boolean
  clientSecretConfigured: boolean
  adminTokenConfigured: boolean
}

type TokenCache = {
  accessToken: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

function normalizeStore(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
}

export function shopifyConfigStatus(): ShopifyConfigStatus {
  const store = firstEnv('SHOPIFY_STORE', 'CRAFT_SHOPIFY_STORE')
  const clientId = firstEnv('SHOPIFY_CLIENT_ID', 'CRAFT_SHOPIFY_CLIENT_ID')
  const clientSecret = firstEnv('SHOPIFY_CLIENT_SECRET', 'CRAFT_SHOPIFY_CLIENT_SECRET')
  const adminToken = firstEnv('SHOPIFY_ADMIN_TOKEN', 'CRAFT_SHOPIFY_ADMIN_TOKEN')

  return {
    configured: Boolean(store && (adminToken || (clientId && clientSecret))),
    storeConfigured: Boolean(store),
    clientIdConfigured: Boolean(clientId),
    clientSecretConfigured: Boolean(clientSecret),
    adminTokenConfigured: Boolean(adminToken),
  }
}

async function shopifyAccessToken() {
  const existingToken = firstEnv('SHOPIFY_ADMIN_TOKEN', 'CRAFT_SHOPIFY_ADMIN_TOKEN')
  if (existingToken) return existingToken

  const store = normalizeStore(firstEnv('SHOPIFY_STORE', 'CRAFT_SHOPIFY_STORE'))
  const clientId = firstEnv('SHOPIFY_CLIENT_ID', 'CRAFT_SHOPIFY_CLIENT_ID')
  const clientSecret = firstEnv('SHOPIFY_CLIENT_SECRET', 'CRAFT_SHOPIFY_CLIENT_SECRET')

  if (!store) throw new Error('Shopify store is not configured.')
  if (!clientId) throw new Error('Shopify client ID is not configured.')
  if (!clientSecret) throw new Error('Shopify client secret is not configured.')

  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const response = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Shopify authentication failed with HTTP ${response.status}.`)
  }

  const payload = (await response.json()) as {
    access_token?: string
    expires_in?: number
  }

  const accessToken = payload.access_token?.trim()
  if (!accessToken) throw new Error('Shopify authentication returned no access token.')

  tokenCache = {
    accessToken,
    expiresAt: now + Math.max(60, payload.expires_in ?? 3600) * 1000,
  }

  return accessToken
}

export async function shopifyGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const store = normalizeStore(firstEnv('SHOPIFY_STORE', 'CRAFT_SHOPIFY_STORE'))
  if (!store) throw new Error('Shopify store is not configured.')

  const accessToken = await shopifyAccessToken()
  const response = await fetch(
    `https://${store}/admin/api/2026-07/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    },
  )

  const payload = (await response.json()) as {
    data?: T
    errors?: Array<{ message?: string }>
  }

  if (!response.ok) {
    throw new Error(`Shopify API request failed with HTTP ${response.status}.`)
  }

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message ?? 'Shopify API error').join('; '))
  }

  if (!payload.data) {
    throw new Error('Shopify API returned no data.')
  }

  return payload.data
}
