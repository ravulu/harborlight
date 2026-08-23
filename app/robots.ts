import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Nothing here is secret — the gates are what protect these — but a
      // crawler asking for them wastes its budget and yours, and a signed-out
      // crawl of them has nothing to index anyway.
      disallow: ['/admin', '/admin/', '/dashboard', '/api/'],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  }
}
