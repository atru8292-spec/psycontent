'use client'
// Старые генераторы (карусели, рилс, хуки, рерайт) у кого включен новый мозг сведены в «Сделать»
// (09-PUT-POLZOVATELYA.md раздел 9, LISHNEE-NA-SAYTE.md пункт 8): перекидываем туда, как анализ конкурентов.
// У старого мозга страница работает как раньше. Пока флаг из layout не пришел, старую страницу не показываем.
import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useDashboardMe } from '@/lib/dashboard-me'

export default function NewBrainRedirect({ to, children }: { to: string; children: ReactNode }) {
  const router = useRouter()
  const { me, loaded } = useDashboardMe()
  const go = loaded && me?.newPipeline === true
  useEffect(() => { if (go) router.replace(to) }, [go, router, to])
  if (!loaded || go) return <div className="min-h-[60vh] bg-brand-bg" />
  return <>{children}</>
}
