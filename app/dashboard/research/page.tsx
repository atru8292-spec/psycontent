'use client'

// Подбор тем. С новым мозгом (newPipeline) это вкладка «Идеи» на экране «Темы»: адрес ведет туда,
// параметры запроса сохраняются. Без флага страница как раньше. Флаг берем из layout, без второго /api/me.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TopicIdeas from '@/components/TopicIdeas'
import { useDashboardMe } from '@/lib/dashboard-me'

export default function ResearchPage() {
  const router = useRouter()
  const { me, loaded } = useDashboardMe()
  const newMenu = me?.newPipeline === true
  useEffect(() => {
    if (!loaded || !newMenu) return
    const qs = new URLSearchParams(window.location.search)
    qs.set('tab', 'ideas')
    router.replace(`/dashboard/content-plan?${qs.toString()}`)
  }, [loaded, newMenu, router])
  if (!loaded || newMenu) return <div className="min-h-dvh" />
  return <TopicIdeas />
}
