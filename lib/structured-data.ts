// Структурированные данные (JSON-LD) для главной: Organization, WebSite, SoftwareApplication, FAQPage.
// Все данные из тех же источников, что и страница: описание сервиса из lib/site.ts (SITE_DEFINITION), цены из lib/pricing.ts,
// вопросы и ответы из FAQ в components/landing/content.ts. Отзывов и рейтингов нет, их не добавляем.
import { SITE_URL, SITE_DEFINITION } from './site'
import { PLANS } from './pricing'
import { FAQ } from '@/components/landing/content'

export function landingJsonLd() {
  const org = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: 'PsyCont',
    url: SITE_URL,
    logo: `${SITE_URL}/brand/psycont-icon.png`,
  }
  const site = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: 'PsyCont',
    url: SITE_URL,
    inLanguage: 'ru',
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
  const app = {
    '@type': 'SoftwareApplication',
    name: 'PsyCont',
    url: SITE_URL,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'ru',
    description: SITE_DEFINITION,
    publisher: { '@id': `${SITE_URL}/#organization` },
    // Платные тарифы помесячно (UnitPriceSpecification на 1 месяц), пробный бесплатно и без периода.
    // Годовую цену отдельным Offer не показываем
    offers: PLANS.map(p => ({
      '@type': 'Offer',
      name: p.name,
      price: String(p.price),
      priceCurrency: 'RUB',
      ...(p.perMonth && p.price > 0 ? {
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: String(p.price),
          priceCurrency: 'RUB',
          unitText: 'MONTH',
          referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
        },
      } : {}),
    })),
  }
  const faq = {
    '@type': 'FAQPage',
    mainEntity: FAQ.items.map(it => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  }
  return { '@context': 'https://schema.org', '@graph': [org, site, app, faq] }
}

// Для вставки в <script type="application/ld+json">: экранируем «<», чтобы текст не мог закрыть тег script
export const jsonLdString = () => JSON.stringify(landingJsonLd()).replace(/</g, '\\u003c')
