'use client'
// /admin без Яндекс Метрики (ревью 17.11). Скрипт тут не грузится, но если человек пришел в /admin переходом без
// перезагрузки (назад по истории), Метрика могла уже работать на прошлой странице: тогда ничего не рисуем
// и перезагружаем страницу, чтобы Вебвизор не увидел почты пользователей.
import { useEffect, useState } from 'react'

export default function NoMetrika({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if ((window as any).ym) location.reload()
    else setOk(true)
  }, [])
  return ok ? <>{children}</> : null
}
