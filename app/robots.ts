import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/chat', '/debug', '/sign-in', '/sign-up', '/upload'],
    },
    sitemap: 'https://smallbizzwizz.com/sitemap.xml',
  }
}