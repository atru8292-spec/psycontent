// sitemap.xml: только публичные страницы. Кабинет, онбординг, админка и вход сюда не входят.
import type { MetadataRoute } from 'next'

const SITE = 'https://psycont.ru'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/offer`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE}/soglasie`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.2 },
  ]
}
