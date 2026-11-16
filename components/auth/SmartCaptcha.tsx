'use client'

// Невидимая Яндекс SmartCaptcha для регистрации (16.11, блок 1 запуска). Работает, только если при сборке задан
// NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY; без ключа ничего не грузит и getToken отдает пустую строку (сервер без
// SMARTCAPTCHA_SERVER_KEY капчу не проверяет). Скрипт грузится с smartcaptcha.yandexcloud.net (российский сервис),
// только когда открыта регистрация. Значок Яндекса со ссылкой на условия обработки данных не прячем (так требует Яндекс).
import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = process.env.NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY || ''
const SRC = 'https://smartcaptcha.yandexcloud.net/captcha.js?render=onload&onload=__psySmartCaptchaReady'

declare global {
  interface Window {
    smartCaptcha?: { render: (el: HTMLElement, o: Record<string, unknown>) => number; execute: (id?: number) => void; reset: (id?: number) => void; destroy: (id?: number) => void; subscribe: (id: number, ev: string, cb: (t?: string) => void) => () => void }
    __psySmartCaptchaReady?: () => void
  }
}

let loading: Promise<boolean> | null = null
function loadScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.smartCaptcha) return Promise.resolve(true)
  if (loading) return loading
  loading = new Promise(resolve => {
    window.__psySmartCaptchaReady = () => resolve(true)
    const s = document.createElement('script')
    s.src = SRC; s.defer = true
    s.onerror = () => { loading = null; resolve(false) }
    document.head.appendChild(s)
    setTimeout(() => resolve(!!window.smartCaptcha), 10000)
  })
  return loading
}

export function useSmartCaptcha(active: boolean) {
  // контейнер через callback ref: окно входа размонтирует форму при закрытии и на экране «проверь почту»,
  // виджет живет ровно столько, сколько его контейнер (иначе при повторном открытии execute шел бы в удаленный, ревью 16.11)
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const widget = useRef<number | null>(null)
  const waiter = useRef<((t: string) => void) | null>(null)

  useEffect(() => {
    if (!KEY || !active || !el) return
    let on = true
    loadScript().then(ok => {
      if (!on || !ok || !window.smartCaptcha || widget.current !== null) return
      widget.current = window.smartCaptcha.render(el, {
        sitekey: KEY, invisible: true, hl: 'ru',
        callback: (token: string) => { waiter.current?.(token); waiter.current = null },
      })
    })
    return () => {
      on = false
      if (widget.current !== null) { try { window.smartCaptcha?.destroy(widget.current) } catch {} widget.current = null }
      waiter.current?.(''); waiter.current = null
    }
  }, [active, el])

  // токен перед отправкой формы; без ключа или без загруженного скрипта пустая строка
  const getToken = useCallback((): Promise<string> => {
    if (!KEY || widget.current === null || !window.smartCaptcha) return Promise.resolve('')
    return new Promise(resolve => {
      waiter.current = resolve
      try { window.smartCaptcha!.reset(widget.current!); window.smartCaptcha!.execute(widget.current!) } catch { resolve('') }
      setTimeout(() => { if (waiter.current === resolve) { waiter.current = null; resolve('') } }, 60000)
    })
  }, [])

  return { box: setEl, getToken, enabled: !!KEY }
}
