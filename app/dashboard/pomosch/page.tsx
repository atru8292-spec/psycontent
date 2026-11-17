'use client'

// «Помощь» (18.11): связь с живым человеком через бота @psycont_supportbot и частые вопросы.
// Вход: внизу меню на компьютере, карточкой HelpCard в «Настройках» на телефоне.
//
// Метка аккаунта: при открытии экрана POST /api/tg/link → { url } (https://t.me/psycont_supportbot?start=<метка>).
// Метка одноразовая и живет 24 ч, почты и id в ней нет. До ответа и при любой ошибке кнопка ведет на бота без метки
// (бот и так примет вопрос, только без карточки аккаунта), тогда под кнопкой просьба указать почту.
// Кнопка настоящая ссылка (<a target=_blank>): window.open после await браузер на телефоне блокирует.
// Кнопка никогда не неактивна и без спиннера. После нажатия метка потрачена, через секунду в фоне берем новую.
// Вернулась на вкладку, а метке больше 20 ч: тоже берем новую.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Send } from 'lucide-react'
import { useFeatureOpen } from '@/lib/analytics/hooks'
import { track } from '@/lib/track'
import { REKV } from '@/lib/rekvizity'
import { QUIET_BTN_SM } from '@/lib/ui-classes'
import { HELP_FAQ, SUPPORT_BOT_URL, type HelpAnswerPart } from '@/lib/help-faq'

const LABEL_FRESH_MS = 20 * 60 * 60 * 1000
const REFRESH_AFTER_CLICK_MS = 1000
// Ссылка внутри предложения (почта, телефон): это не действие-кнопка, поэтому подчеркнута, как в оферте и политике
const INLINE_LINK = 'font-medium text-brand-accent underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent'

// Принимаем только ссылку на своего бота с меткой: чужой адрес с сервера на кнопку не попадет
const isLabeledUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.startsWith(`${SUPPORT_BOT_URL}?start=`) && u.length <= 200

function useSupportLink() {
  const [url, setUrl] = useState(SUPPORT_BOT_URL)
  const [failed, setFailed] = useState(false)
  const gotAt = useRef(0)
  const busy = useRef(false)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    let next: string | null = null
    try {
      const r = await fetch('/api/tg/link', { method: 'POST', cache: 'no-store' })
      if (r.ok) {
        const d: unknown = await r.json().catch(() => null)
        const u = d && typeof d === 'object' ? (d as { url?: unknown }).url : null
        if (isLabeledUrl(u)) next = u
      }
    } catch { /* без сети: остаемся на ссылке без метки */ }
    busy.current = false
    if (!alive.current) return
    if (next) { setUrl(next); setFailed(false); gotAt.current = Date.now() }
    else { setUrl(SUPPORT_BOT_URL); setFailed(true); gotAt.current = 0 }
  }, [])

  useEffect(() => {
    alive.current = true
    refresh()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      // метки нет (сбой или сервер отдал ссылку без метки) или она старая: просим заново (ревью 18.11)
      if (!gotAt.current || Date.now() - gotAt.current > LABEL_FRESH_MS) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive.current = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [refresh])

  const onClick = useCallback(() => {
    track('help_tg_click', { with_label: url !== SUPPORT_BOT_URL })
    // Ссылка уже ушла в Telegram; метка одноразовая, поэтому следующую берем заранее
    window.setTimeout(() => { if (alive.current) refresh() }, REFRESH_AFTER_CLICK_MS)
  }, [url, refresh])

  return { url, failed, onClick }
}

function Answer({ parts }: { parts: HelpAnswerPart[] }) {
  return (
    <p>
      {parts.map((p, i) => typeof p === 'string'
        ? <span key={i}>{p}</span>
        : <a key={i} href={p.href} className={`${INLINE_LINK} whitespace-nowrap`}>{p.text}</a>)}
    </p>
  )
}

function HelpFaq() {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const base = useId()
  const toggle = (q: string) => {
    // событие до setOpen и по текущему состоянию: updater в StrictMode зовется дважды (ревью 18.11)
    if (!open.has(q)) track('help_faq_open', { q })
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(q)) next.delete(q)
      else next.add(q)
      return next
    })
  }

  return (
    <div className="mt-3 rounded-[20px] bg-brand-card border border-brand-border divide-y divide-brand-border overflow-hidden">
      {HELP_FAQ.map(it => {
        const on = open.has(it.q)
        const qid = `${base}-q-${it.q}`
        const aid = `${base}-a-${it.q}`
        return (
          <div key={it.q}>
            <h3>
              <button type="button" id={qid} aria-expanded={on} aria-controls={aid} onClick={() => toggle(it.q)}
                className="flex w-full min-h-14 items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left text-[16px] leading-6 font-semibold text-brand-text hover:bg-brand-soft-2 transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-accent">
                <span className="min-w-0">{it.title}</span>
                <ChevronDown aria-hidden className={`w-5 h-5 shrink-0 text-brand-text-secondary motion-safe:transition-transform motion-safe:duration-200 ${on ? 'rotate-180' : ''}`} />
              </button>
            </h3>
            {/* Высота анимируется через grid-template-rows 0fr → 1fr; закрытый ответ inert, чтобы кнопка внутри не ловила Tab */}
            <div id={aid} role="region" aria-labelledby={qid} inert={!on}
              className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${on ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden min-w-0">
                <div className="px-4 sm:px-5 pb-4 max-w-[60ch] text-[15px] leading-[22px] text-brand-text-secondary">
                  <Answer parts={it.answer} />
                  {it.action && (
                    <Link href={it.action.href} className={`${QUIET_BTN_SM} mt-3`}>{it.action.label}</Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function HelpPage() {
  useFeatureOpen('help')
  const { url, failed, onClick } = useSupportLink()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-12 pt-4 lg:pt-10 pb-10">
      <h1 className="text-[26px] leading-8 lg:text-[32px] lg:leading-10 font-semibold text-brand-text">Что-то не получается?</h1>
      <p className="mt-2 text-[16px] leading-6 text-brand-text-secondary">Ответит живой человек из команды PsyCont, обычно в течение дня</p>

      <a href={url} target="_blank" rel="noopener noreferrer" onClick={onClick}
        className="mt-5 h-12 w-full sm:w-auto px-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-accent text-white text-[16px] font-semibold hover:bg-brand-accent-hover transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">
        <Send className="w-[18px] h-[18px]" aria-hidden />
        Написать в Telegram
      </a>

      <div aria-live="polite">
        {failed && (
          <p className="mt-3 text-[14px] leading-5 text-brand-text-secondary">Если напишешь, добавь почту, с которой входишь в PsyCont, так ответ будет быстрее.</p>
        )}
      </div>
      {REKV.email && (
        <p className="mt-3 text-[14px] leading-5 text-brand-text-secondary">
          Нет Telegram? Напиши на почту <a href={`mailto:${REKV.email}`} className={INLINE_LINK}>{REKV.email}</a>
        </p>
      )}

      <h2 className="mt-8 text-[20px] leading-7 font-semibold text-brand-text">Частые вопросы</h2>
      <HelpFaq />
    </div>
  )
}
