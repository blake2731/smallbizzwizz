import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SmallBizzWizz',
    short_name: 'SmallBizzWizz',
    description: 'The business-savvy friend you never had. Direct answers on pricing, contracts, clients, and hiring.',
    start_url: '/chat',
    display: 'standalone',
    background_color: '#f7f4ef',
    theme_color: '#c8410a',
    orientation: 'portrait',
    icons: [
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
