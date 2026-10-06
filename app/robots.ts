// robots.txt: все публичное открыто для всех ботов, включая поисковых и ботов нейросетей (и для ответов, и для обучения:
// новому бренду выгодно, чтобы модели его знали). Закрыты только личные разделы, служебные адреса и API.
import type { MetadataRoute } from 'next'

const SITE = 'https://psycont.ru'
const DISALLOW = ['/dashboard', '/onboarding', '/admin', '/api', '/auth']

// Явно перечислены, чтобы ни один не остался закрытым по чужому умолчанию
const BOTS = [
  'Googlebot', 'Bingbot', 'YandexBot',
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
  'Claude-SearchBot', 'Claude-User', 'ClaudeBot',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      ...BOTS.map(userAgent => ({ userAgent, allow: '/', disallow: DISALLOW })),
    ],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
