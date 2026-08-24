import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/seo'

/**
 * The pages worth indexing. Private ones are left out rather than listed and
 * disallowed: a sitemap is a recommendation of what to read, and pages behind
 * a sign-in have nothing for a crawler to see.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE.url}/planner`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE.url}/goal`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE.url}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE.url}/sign-up`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE.url}/sign-in`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ]
}
