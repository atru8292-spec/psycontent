'use client'

// screen_view при смене экрана (задача analitika, этап 2). Один слушатель в layout кабинета и онбординга.
// screen это короткое имя из lib/analytics/events.ts (SCREENS), а не сырой путь.

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/track'
import { screenOf } from '@/lib/analytics/events'

export default function ScreenTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (pathname) track('screen_view', { screen: screenOf(pathname) })
  }, [pathname])
  return null
}
