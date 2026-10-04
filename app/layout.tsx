import type { Metadata, Viewport } from 'next'
import { Onest } from 'next/font/google'
import './globals.css'

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap',
})

const TITLE = 'PsyCont: посты и рилсы твоим голосом для психологов'
const DESCRIPTION = 'PsyCont пишет посты, карусели и рилсы так, как ты говоришь с клиентами. Маркетологом становиться не надо. 10 материалов бесплатно.'

export const metadata: Metadata = {
  metadataBase: new URL('https://psycont.ru'),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://psycont.ru',
    siteName: 'PsyCont',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'PsyCont, блог без выгорания' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/og.png'] },
  icons: {
    icon: [{ url: '/brand/psycont-favicon.svg', type: 'image/svg+xml' }, { url: '/brand/psycont-favicon.png', type: 'image/png' }],
    apple: '/brand/psycont-apple-touch-icon.png',
  },
}

// iPhone: контент под вырезом и домашней полоской (safe-area в шапке и таб-баре), масштаб пальцами не запрещаем
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F5EFE4',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className={onest.variable}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
