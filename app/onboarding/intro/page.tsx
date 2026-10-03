'use client'

// Листалку убрали из пути нового пользователя (09-PUT-POLZOVATELYA.md, раздел 1.2).
// Адрес оставлен: сюда ведут регистрация по почте, вход через Яндекс и старые письма.
// Сразу отправляем в знакомство, а оно само разведет: нет сессии, есть профиль.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function IntroRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/onboarding/express') }, [router])
  return <div className="min-h-[100dvh] bg-brand-bg" />
}
