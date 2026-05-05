import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/subscribe'],
        disallow: ['/chat', '/api/', '/sign-in', '/sign-up'],
      },
    ],
    sitemap: 'https://smallbizzwizz.com/sitemap.xml',
  }
}
