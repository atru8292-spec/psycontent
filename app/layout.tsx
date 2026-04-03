import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PsyContent — Персональный контент на основе психопрофиля',
  description: 'Создавайте контент, который резонирует с вашей аудиторией.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
