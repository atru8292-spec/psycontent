import type { Metadata } from 'next'
import ScreenTracker from '@/components/analytics/ScreenTracker'

// Онбординг закрыт от поисковиков и ботов нейросетей (noindex)
export const metadata: Metadata = { robots: { index: false, follow: false } }

// Онбординг: только слушатель экранов для аналитики (screen_view), разметка у каждой страницы своя
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScreenTracker />
      {children}
    </>
  )
}
