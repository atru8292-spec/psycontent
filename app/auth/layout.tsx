import type { Metadata } from 'next'

// Страницы входа по ссылкам из писем закрыты от поисковиков (как кабинет и онбординг).
// Роуты app/auth/callback и app/auth/yandex это обработчики, layout на них не действует.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
