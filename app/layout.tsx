import type { Metadata } from 'next'
import { Onest } from 'next/font/google'
import './globals.css'

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PsyCont — пишет как живой психолог, чтобы блог приводил клиентов',
  description: 'AI-сервис для психологов: генерация постов, Reels-сценариев и контент-плана в вашем голосе. Звучит как вы — работает лучше.',
  icons: {
    icon: '/logo/out_favicon.svg',
  },
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
