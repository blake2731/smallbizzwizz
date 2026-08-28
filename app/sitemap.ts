import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return [
    {
      url: 'https://smallbizzwizz.com',
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://smallbizzwizz.com/proof',
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://smallbizzwizz.com/methodology',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: 'https://smallbizzwizz.com/sample',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]
}
