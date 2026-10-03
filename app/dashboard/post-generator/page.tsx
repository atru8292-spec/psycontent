'use client'

// Генератор постов стал экраном «Сделать» (/dashboard/make). Старый адрес живет ради
// закладок и ссылок из плана: переносим все параметры как есть.
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function Redirect() {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    const q = params.toString()
    router.replace(`/dashboard/make${q ? `?${q}` : ''}`)
  }, [router, params])
  return null
}

export default function PostGeneratorRedirect() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  )
}
