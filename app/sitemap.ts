// sitemap.xml: только публичные страницы. Кабинет, онбординг, админка и вход сюда не входят.
// Когда появятся /offer и /privacy, добавить их сюда и в public/llms.txt.
import type { MetadataRoute } from 'next'

const SITE = 'https://psycont.ru'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
  ]
}
