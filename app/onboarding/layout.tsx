import ScreenTracker from '@/components/analytics/ScreenTracker'

// Онбординг: только слушатель экранов для аналитики (screen_view), разметка у каждой страницы своя
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScreenTracker />
      {children}
    </>
  )
}
