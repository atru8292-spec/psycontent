'use client'
// Плашка про cookie на публичных страницах (лендинг, /offer, /privacy). Показывается, пока человек не нажал «Понятно»;
// ответ хранится только в его браузере (localStorage psy_cookie_ok); на сервер уходит одно событие land_cookie_ok без данных.
// До монтирования не рисуется: в HTML ее нет, первый экран не прыгает. В кабинете плашки нет: туда попадают после регистрации.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PRIVACY_PATH, METRIKA_ON } from '@/lib/rekvizity'
import { track } from '@/lib/track'

const KEY = 'psy_cookie_ok'

export default function CookieNote() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem(KEY) !== '1') setShow(true) } catch { setShow(true) }
  }, [])
  if (!show) return null
  const ok = () => { try { localStorage.setItem(KEY, '1') } catch {} track('land_cookie_ok'); setShow(false) }
  return (
    <div role="region" aria-label="Про cookie" className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:px-6 lg:pb-6">
      <div className="mx-auto flex max-w-[720px] flex-col gap-3 rounded-2xl border border-brand-border bg-brand-card p-4 shadow-[0_6px_24px_rgb(59_42_34/0.14)] sm:flex-row sm:items-center sm:gap-5">
        <p className="text-[14px] leading-[1.45] text-brand-text">
          Сайт использует cookie{METRIKA_ON ? ' и Яндекс Метрику' : ''}, чтобы работал вход и чтобы улучшать сервис.{' '}
          <Link href={PRIVACY_PATH} className="font-medium text-brand-accent underline underline-offset-4">Как это устроено</Link>
        </p>
        <button type="button" onClick={ok}
          className="h-11 shrink-0 cursor-pointer rounded-xl bg-brand-accent px-5 text-[15px] font-semibold text-brand-bg transition-colors hover:bg-brand-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">
          Понятно
        </button>
      </div>
    </div>
  )
}
