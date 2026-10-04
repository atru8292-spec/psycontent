import type { Metadata, Viewport } from 'next'
import { Onest } from 'next/font/google'
import './globals.css'

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PsyCont, пишет как живой психолог, чтобы блог приводил клиентов',
  description: 'AI-сервис для психологов: генерация постов, Reels-сценариев и контент-плана в вашем голосе. Звучит как вы, работает лучше.',
  icons: {
    icon: [{ url: '/logo/out_favicon.svg', type: 'image/svg+xml' }, { url: '/logo/out_favicon.png', type: 'image/png' }],
    apple: '/logo/apple-touch-icon.png',
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
