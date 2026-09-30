import { auth } from '@clerk/nextjs/server'
import { shopifyConfigStatus, shopifyGraphql } from '@/lib/shopify-admin'

type ShopStatusQuery = {
  shop: {
    name: string
    myshopifyDomain: string
  }
}

const SHOP_STATUS_QUERY = `
  query AuctionShopifyStatus {
    shop {
      name
      myshopifyDomain
    }
  }
`

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    const { userId } = await auth()
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const config = shopifyConfigStatus()
  if (!config.configured) {
    return Response.json(
      {
        ...config,
        connected: false,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  }

  try {
    const data = await shopifyGraphql<ShopStatusQuery>(SHOP_STATUS_QUERY)
    return Response.json(
      {
        ...config,
        connected: true,
        shopName: data.shop.name,
        shopDomain: data.shop.myshopifyDomain,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    return Response.json(
      {
        ...config,
        connected: false,
        error: error instanceof Error ? error.message : 'Shopify connection failed.',
      },
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  }
}
