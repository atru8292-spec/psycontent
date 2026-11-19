'use client'
// Переход в «Сделать» без текстов в адресе (решение Арины 17.11, Метрика): тема, рубрика, ситуация, роль и реакция
// из «Тем», «Идей» и финала знакомства кладутся в sessionStorage, в адресе остается только ключ h и коды
// (format, formats, fkod, first, auto). Экран «Сделать» читает параметры через useMakeParams: сначала адрес
// (старые ссылки с ?topic= продолжают работать), потом передачу по ключу. Передача не стирается при чтении
// (перерисовки и повторный монтаж читают ее снова), следующий переход ее заменяет.
import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'

const KEY = 'psy_make_handoff'
const TEXT = ['topic', 'pillar', 'rol', 'reakciya', 'sit'] as const
// Одноразовые признаки (go: финал знакомства сразу запускает первый текст, аудит 19.11 Б1). Живут в передаче
// рядом с темой, экран забирает их через takeMakeOnce и тут же стирает: обновление страницы и «Назад» не запускают второй раз
const ONCE = ['go'] as const

export function makeHref(all: Record<string, string | null | undefined>, base = '/dashboard/make'): string {
  const url = new URLSearchParams()
  const text: Record<string, string> = {}
  const once: Record<string, string> = {}
  for (const [k, v] of Object.entries(all)) {
    if (v == null || v === '') continue
    if ((TEXT as readonly string[]).includes(k)) text[k] = String(v)
    else if ((ONCE as readonly string[]).includes(k)) once[k] = String(v)
    else url.append(k, String(v))
  }
  if (Object.keys(text).length || Object.keys(once).length) {
    const h = Math.random().toString(36).slice(2, 10)
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ h, text, once }))
      url.append('h', h)
    } catch {
      // без sessionStorage (приватный режим с запретом) тема важнее чистоты адреса
      for (const [k, v] of Object.entries({ ...text, ...once })) url.append(k, v)
    }
  }
  const q = url.toString()
  return `${base}${q ? '?' + q : ''}`
}

function handoff(h: string | null): Record<string, string> {
  if (!h) return {}
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    return v && v.h === h && v.text && typeof v.text === 'object' ? v.text : {}
  } catch { return {} }
}

// Без хука (старые страницы карусели и рилса): параметр из адреса или из передачи
export function readMakeParam(k: string): string | null {
  try {
    const sp = new URLSearchParams(window.location.search)
    return sp.get(k) ?? handoff(sp.get('h'))[k] ?? null
  } catch { return null }
}

// Забрать одноразовый признак (go) и сразу стереть: из передачи по ключу h, а без sessionStorage из адреса
export function takeMakeOnce(k: typeof ONCE[number]): string | null {
  try {
    const sp = new URLSearchParams(window.location.search)
    const fromUrl = sp.get(k)
    if (fromUrl != null) {
      sp.delete(k)
      const q = sp.toString()
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? '?' + q : ''}`)
      return fromUrl
    }
    const h = sp.get('h')
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (!h || !v || v.h !== h || !v.once || typeof v.once[k] !== 'string') return null
    const val = v.once[k] as string
    delete v.once[k]
    sessionStorage.setItem(KEY, JSON.stringify(v))
    return val
  } catch { return null }
}

export type MakeParams = { get(k: string): string | null }

export function useMakeParams(): MakeParams {
  const sp = useSearchParams()
  return useMemo(() => {
    const text = typeof window === 'undefined' ? {} : handoff(sp.get('h'))
    return { get: (k: string) => sp.get(k) ?? (typeof text[k] === 'string' ? text[k] : null) }
  }, [sp])
}
