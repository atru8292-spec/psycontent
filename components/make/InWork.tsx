'use client'

// «Еще не в блоге · N» на «Написать» (макеты A1, A3; словарь 17.11, строка 56): тексты за 14 дней без published_at,
// одна мысль одной строкой. «Уже в блоге» отмечает через /api/generate-post/published (сервер пишет material_take
// published), после нажатия «Опубликовано» и «Отменить». Зона нажатия 44 px. «Все» ведет в «Мои тексты».

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Loader2 } from 'lucide-react'
import { track } from '@/lib/track'
import { QUIET_BTN_SM, QUIET_BTN_SM_MUTED } from '@/lib/ui-classes'
import { formatOne } from './formats'
import type { InWorkItem } from './useDesk'

const TEXTS_HREF = '/dashboard/post-history'

const shortDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '') } catch { return '' }
}
const formatsLine = (fs: string[]) => {
  const w = fs.map(formatOne)
  return w.length < 2 ? w.join('') : `${w.slice(0, -1).join(', ')} и ${w[w.length - 1]}`
}

async function mark(ids: string[], undo: boolean): Promise<boolean> {
  const res = await Promise.all(ids.map(postId =>
    fetch('/api/generate-post/published', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, undo }) })
      .then(r => r.ok).catch(() => false)))
  return res.every(Boolean)
}

// компьютер от 1024 px: две строки, телефон три. Третья строка прячется CSS (lg:hidden), а не по matchMedia:
// иначе на компьютере она мигала при загрузке, пока скрипт не узнал ширину
const ROWS = 3

export default function InWork({ items, firstTime, onChanged }: {
  items: InWorkItem[] | null
  firstTime: boolean
  onChanged?: () => void  // отметка поменялась: перечитать ритм месяца (с паузой, чтобы «Отменить» успели нажать)
}) {
  // перечитываем через 6 с после последней отметки: сразу строка пропала бы вместе с «Отменить»
  const reloadTimer = useRef<number | null>(null)
  const changedRef = useRef(onChanged)
  changedRef.current = onChanged
  useEffect(() => () => { if (reloadTimer.current) window.clearTimeout(reloadTimer.current) }, [])
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (firstTime) {
    return (
      <section className="pt-6 border-t border-brand-border">
        <h2 className="hidden lg:block text-[18px] leading-[26px] font-semibold text-brand-text">Здесь будут тексты, которые ты напишешь</h2>
        <p className="mt-1 text-[14px] leading-5 text-brand-muted">
          <span className="lg:hidden">Тексты сохранятся сами в «Моих текстах»</span>
          <span className="hidden lg:inline">Все сохраняется само в «Моих текстах». Скопируй, выложи и отметь «Уже в блоге», так виден ритм месяца.</span>
        </p>
      </section>
    )
  }
  if (!items) return null
  const count = items.filter(x => !done[x.key]).length

  if (!items.length) {
    return <p className="text-[14px] leading-5 text-brand-muted">Все написанное уже в блоге.</p>
  }

  const toggle = async (x: InWorkItem) => {
    if (busy) return
    const undo = !!done[x.key]
    setBusy(x.key); setErr(null)
    setDone(d => ({ ...d, [x.key]: !undo }))
    const ok = await mark(x.ids, undo)
    if (!ok) { setDone(d => ({ ...d, [x.key]: undo })); setErr('Отметить не получилось. Проверь интернет и нажми еще раз') }
    setBusy(null)
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
    reloadTimer.current = window.setTimeout(() => { reloadTimer.current = null; changedRef.current?.() }, 6000)
  }

  return (
    <section aria-labelledby="inwork-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="inwork-h" className="text-[20px] lg:text-[22px] leading-[30px] font-semibold text-brand-text">Еще не в блоге · {count}</h2>
        <Link href={TEXTS_HREF} onClick={() => track('feature_open', { feature: 'texts' })}
          className={`shrink-0 ${QUIET_BTN_SM}`}>Все</Link>
      </div>
      <ul className="mt-1.5">
        {items.slice(0, ROWS).map((x, i) => {
          const on = !!done[x.key]
          return (
            <li key={x.key} className={`${i >= 2 ? 'lg:hidden ' : ''}flex items-center gap-2 sm:gap-3.5 py-2 border-b border-brand-border`}>
              <Link href={`/dashboard/make?post=${x.firstId}`} className="min-w-0 flex-1 py-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-accent">
                <span className={`block truncate text-[16px] leading-6 font-medium ${on ? 'text-brand-muted' : 'text-brand-text'}`}>{x.title}</span>
                <span className="block text-[13px] leading-[18px] text-brand-muted">{formatsLine(x.formats)} · {shortDate(x.createdAt)}</span>
              </Link>
              {on ? (
                <span className="shrink-0 inline-flex items-center gap-1">
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-accent"><Check className="w-4 h-4" />Опубликовано</span>
                  <button type="button" onClick={() => toggle(x)} disabled={busy === x.key}
                    className={`ml-1 ${QUIET_BTN_SM_MUTED}`}>Отменить</button>
                </span>
              ) : (
                <button type="button" onClick={() => toggle(x)} disabled={busy === x.key} aria-label={`Уже в блоге: ${x.title}`}
                  className="shrink-0 h-11 inline-flex items-center gap-1.5 pl-2.5 pr-3.5 rounded-full border border-brand-border bg-white text-[13px] font-medium text-brand-text-secondary hover:border-brand-accent hover:text-brand-text cursor-pointer transition">
                  {busy === x.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-brand-muted" />}Уже в блоге
                </button>
              )}
              <Link href={`/dashboard/make?post=${x.firstId}`} aria-label={`Открыть: ${x.title}`} className="flex w-7 sm:w-8 h-11 items-center justify-center text-brand-muted hover:text-brand-text shrink-0">
                <ChevronRight className="w-[18px] h-[18px]" />
              </Link>
            </li>
          )
        })}
      </ul>
      {err && <p className="mt-2 text-[13px] text-brand-text" role="status">{err}</p>}
    </section>
  )
}
