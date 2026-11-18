import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION } from '@/lib/site'

// PWA: PsyCont на экране «Домой» телефона (подсказка в «Настройках», components/dashboard/AddToHome.tsx).
// Открывается сразу на «Написать». Иконки из public/brand/psycont-icon.png (192, 512 и maskable на зеленом поле).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PsyCont',
    short_name: 'PsyCont',
    description: SITE_DESCRIPTION,
    start_url: '/dashboard/make',
    scope: '/',
    display: 'standalone',
    background_color: '#F5EFE4',
    theme_color: '#F5EFE4',
    lang: 'ru',
    icons: [
      { src: '/brand/psycont-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/psycont-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/psycont-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
