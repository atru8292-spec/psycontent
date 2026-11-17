'use client'
// Баннер согласия на cookie и Яндекс Метрику + сама Метрика (17.11, заменил CookieNote с одной кнопкой «Понятно»).
// Стоит в корневом layout, поэтому работает на лендинге, /offer, /privacy, в кабинете и знакомстве. В /admin, /api,
// /dev не рисуется и Метрику не грузит (lib/metrika.ts metrikaPathAllowed).
// Спека designer-psycont 17.11: две одинаковые кнопки с обводкой («Отказаться» и «Принять»), без крестика,
// белая карточка, z-[55] (выше таб-бара 40 и нижних панелей 50, ниже тостов 60). В кабинете и знакомстве на телефоне сверху.
// Пока на мобилке человек печатает в поле, баннер прячется (иначе висит над клавиатурой), ответ не записывается.
// «Настройки cookie» в подвале (CookieSettingsLink) открывает баннер снова; отказ после согласия перезагружает
// страницу, чтобы Метрика выгрузилась. Текст баннера от Арины 17.11.
import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PRIVACY_PATH } from '@/lib/rekvizity'
import { track } from '@/lib/track'
import {
  getConsent, setConsent, loadMetrika, metrikaRoute, metrikaLoaded, metrikaPathAllowed,
  rememberLandingUrl, goalsFromCookie,
} from '@/lib/metrika'

export const COOKIE_OPEN_EVENT = 'psy-cookie-open'

const BTN = 'h-11 min-w-0 cursor-pointer rounded-xl border-[1.5px] border-brand-accent bg-brand-card px-4 text-[15px] font-semibold text-brand-accent transition-colors hover:bg-brand-accent hover:text-brand-bg active:bg-brand-accent-hover active:text-brand-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none sm:w-[132px] sm:px-5'

export default function CookieBanner() {
  const pathname = usePathname() || '/'
  const search = useSearchParams()
  const [show, setShow] = useState(false)
  const [typing, setTyping] = useState(false)
  const allowed = metrikaPathAllowed(pathname)

  // первый показ: адрес с UTM запоминаем до ответа; согласие уже есть, грузим Метрику, иначе спрашиваем
  useEffect(() => {
    if (!allowed) return
    rememberLandingUrl()
    const c = getConsent()
    if (c === 'yes') { loadMetrika(); goalsFromCookie() }
    else { if (c === null) setShow(true); goalsFromCookie() } // при отказе cookie целей стирается, без ответа ждет
    const open = () => setShow(true)
    window.addEventListener(COOKIE_OPEN_EVENT, open)
    return () => window.removeEventListener(COOKIE_OPEN_EVENT, open)
  }, [allowed])

  // хит на каждую смену адреса без перезагрузки; на закрытом пути с загруженной Метрикой страница перезагрузится
  useEffect(() => { if (getConsent() === 'yes' || metrikaLoaded()) metrikaRoute() }, [pathname, search])

  // мобилка: поле в фокусе, баннер прячем
  useEffect(() => {
    if (!show) return
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    const on = (e: FocusEvent) => { if (window.innerWidth < 1024 && isField(e.target)) setTyping(true) }
    const off = (e: FocusEvent) => { if (isField(e.target)) setTyping(false) }
    document.addEventListener('focusin', on)
    document.addEventListener('focusout', off)
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off) }
  }, [show])

  if (!show || !allowed) return null

  const accept = () => {
    setConsent('yes'); track('land_cookie_ok'); setShow(false)
    loadMetrika(); goalsFromCookie()
  }
  const decline = () => {
    const wasOn = metrikaLoaded()
    setConsent('no'); track('land_cookie_no'); setShow(false)
    if (wasOn) location.reload() // Метрика уже работала: перезагрузка выгружает ее
  }
  // Кабинет и знакомство на телефоне: баннер сверху. Внизу там таб-бар, липкая панель «Скопировать», кнопки «Дальше»
  // и «Сохранить»: главное действие должно быть видно сразу (мобильное правило проекта, ревью 17.11)
  const topOnPhone = pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')

  return (
    <div role="region" aria-label="Согласие на cookie"
      className={`fixed inset-x-0 z-[55] px-3 lg:px-6 bottom-0 pb-[max(12px,env(safe-area-inset-bottom))] lg:pb-6 ${topOnPhone ? 'max-lg:top-0 max-lg:bottom-auto max-lg:pt-[max(8px,env(safe-area-inset-top))] max-lg:pb-0' : ''} ${typing ? 'hidden' : ''}`}>
      <div className="mx-auto flex max-w-[720px] flex-col gap-3 rounded-2xl border border-brand-border bg-brand-card p-4 shadow-[0_6px_24px_rgb(59_42_34/0.14)] sm:flex-row sm:items-center sm:gap-5">
        <p className="min-w-0 text-[14px] leading-[1.45] text-brand-text">
          Мы используем cookie и Яндекс Метрику, чтобы улучшать сервис и тексты.{' '}
          <Link href={PRIVACY_PATH} className="whitespace-nowrap rounded-sm font-medium text-brand-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">Подробнее о данных</Link>
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:gap-2">
          <button type="button" onClick={decline} className={BTN}>Отказаться</button>
          <button type="button" onClick={accept} className={BTN}>Принять</button>
        </div>
      </div>
    </div>
  )
}

// Ссылка «Настройки cookie» в подвалах: снова показывает баннер, чтобы поменять решение
export function CookieSettingsLink({ className = '' }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(COOKIE_OPEN_EVENT))} className={`cursor-pointer ${className}`}>
      Настройки cookie
    </button>
  )
}
