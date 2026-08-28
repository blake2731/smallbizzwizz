import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/audit/report',
        '/chat',
        '/debug',
        '/facilities',
        '/sign-in',
        '/sign-up',
        '/subscribe',
        '/upload',
      ],
    },
    sitemap: 'https://smallbizzwizz.com/sitemap.xml',
  }
}
