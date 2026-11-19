'use client'
// Опрос при уходе (аналитика 2, SPEC A). Сейчас стоит на главной кабинета: place="cooling" для тех, кто остыл
// или ушел и вернулся, place="stuck" («Где все застопорилось?») для тех, кто 3+ дня и ни разу не взял текст
// (у stuck свои тексты STUCK_COPY и причины, кнопки паузы нет, остальное то же). Право на показ решает сервер: GET /api/exit-survey (он же пишет exit_survey_shown).
// place="delete" и place="cancel" компонент уже умеет: подключать на экран удаления аккаунта и на экран отмены
// подписки, когда они появятся (сейчас их в продукте нет), так: <ExitSurveyCard place="delete" onClose={...} />.
// Тексты только из lib/analytics/exit-copy.ts. Поле своих слов без микрофона намеренно: диктовка ушла бы
// в память голоса (voice_events), а это не ее текст для блога.

import { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { EXIT_COPY, STUCK_COPY, REASON_RU } from '@/lib/analytics/exit-copy'
import { visibleReasons, OTHER_MAX, type ExitPlace, type ExitReason } from '@/lib/analytics/exit-survey'
import { track } from '@/lib/track'
import { QUIET_BTN_MUTED } from '@/lib/ui-classes'

export type ExitSurveyView = 'collapsed' | 'open' | 'thanks' | 'pause'

const COUNTER_FROM = 240
const SEND_ERROR = 'Не отправилось. Проверь интернет и нажми еще раз'

export default function ExitSurveyCard({ place, onClose, paymentsOn = false, initialView = 'collapsed', initialContact = false }: {
  place: ExitPlace
  onClose: () => void
  paymentsOn?: boolean
  // для страницы предпросмотра /preview/analitika: открыть сразу в нужном состоянии
  initialView?: ExitSurveyView
  initialContact?: boolean
}) {
  const [view, setView] = useState<ExitSurveyView>(initialView)
  const [picked, setPicked] = useState<ExitReason[]>([])
  const [other, setOther] = useState('')
  const [contact, setContact] = useState(initialContact)
  const [sending, setSending] = useState<null | 'pause' | 'answer'>(null)
  const [error, setError] = useState(false)
  // подсказка «отметь хотя бы один пункт» только после нажатия на пустую «Отправить», не заранее (product-kritik)
  const [triedEmpty, setTriedEmpty] = useState(false)

  const stuck = place === 'stuck'
  const reasons = visibleReasons(paymentsOn, place)
  const copy = stuck ? STUCK_COPY : EXIT_COPY
  const empty = !picked.length && !other.trim()

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/exit-survey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ place, ...body }) })
    if (!r.ok) throw new Error(String(r.status))
  }

  const sendPause = async () => {
    if (sending || stuck) return
    setSending('pause'); setError(false)
    try { await post({ action: 'pause' }); setView('pause') } catch { setError(true) } finally { setSending(null) }
  }
  const sendAnswer = async () => {
    if (sending || empty) return
    setSending('answer'); setError(false)
    try { await post({ reasons: picked, other: other.trim(), contact }); setView('thanks') } catch { setError(true) } finally { setSending(null) }
  }
  const later = () => { track('exit_survey_dismiss', { place }); onClose() }
  const openUp = () => { setError(false); setView('open'); track('exit_survey_open', { place }) }
  const toggle = (r: ExitReason) => setPicked(p => (p.includes(r) ? p.filter(x => x !== r) : [...p, r]))

  const root = 'relative mb-8 p-5 sm:p-6 rounded-3xl bg-brand-card border border-brand-border'
  const secondary = 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl bg-brand-bg border border-brand-border text-sm font-semibold text-brand-text hover:bg-brand-soft transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2'
  // «Позже»: тихая кнопка с рамкой, не текст (правило 17.11: действий текстом-ссылкой нет)
  const textBtn = QUIET_BTN_MUTED

  // Спасибо: после ответа и после «была пауза». Крестик только закрывает, «закрыла опрос» он не пишет:
  // ответ уже записан, иначе в кабинете ответившие посчитались бы закрывшими.
  if (view === 'thanks' || view === 'pause') {
    return (
      <section className={root} aria-live="polite">
        <button type="button" onClick={onClose} aria-label="Закрыть"
          className="absolute top-3 right-3 w-11 h-11 inline-flex items-center justify-center rounded-full text-brand-muted hover:text-brand-text hover:bg-brand-bg transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent">
          <X className="w-5 h-5" aria-hidden />
        </button>
        <div className="flex items-center gap-4 pr-10 max-w-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vera/avatar.webp" alt="" className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0" />
          <div className="min-w-0">
            {view === 'pause' ? (
              <p className="font-semibold text-brand-text">{EXIT_COPY.pauseThanks}</p>
            ) : (
              <>
                <p className="font-semibold text-brand-text">{copy.thanksTitle}</p>
                <p className="text-sm text-brand-muted mt-1">{copy.thanksText}</p>
                {contact && <p className="text-sm text-brand-muted mt-1">{EXIT_COPY.thanksContact}</p>}
              </>
            )}
          </div>
        </div>
      </section>
    )
  }

  const errorLine = error && <p role="alert" className="text-sm text-brand-text font-medium">{SEND_ERROR}</p>

  if (view === 'collapsed') {
    return (
      <section className={root} aria-labelledby="exit-survey-title">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h2 id="exit-survey-title" className="font-bold text-lg leading-tight text-brand-text">{copy.title}</h2>
            <p className="text-sm text-brand-muted mt-1">{copy.leadCollapsed}</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end shrink-0">
            {errorLine}
            <div className="flex flex-wrap gap-2">
              {!stuck && (
                <button type="button" onClick={sendPause} disabled={!!sending} className={secondary}>
                  {sending === 'pause' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {EXIT_COPY.pause}
                </button>
              )}
              <button type="button" onClick={openUp} disabled={!!sending} aria-expanded={false} className={secondary}>Рассказать</button>
              <button type="button" onClick={later} disabled={!!sending} className={textBtn}>{EXIT_COPY.later}</button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // Раскрыта
  return (
    <section className={root} aria-labelledby="exit-survey-title">
      <div className="max-w-2xl">
        <h2 id="exit-survey-title" className="font-bold text-lg leading-tight text-brand-text">{copy.title}</h2>
        <p className="text-sm text-brand-muted mt-1">{copy.leadOpen}</p>

        <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label={copy.title}>
          {reasons.map(r => {
            const on = picked.includes(r)
            return (
              <button key={r} type="button" aria-pressed={on} onClick={() => toggle(r)}
                className={`inline-flex items-center gap-2 min-h-11 px-4 py-2 rounded-full border text-sm text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${
                  on ? 'bg-brand-soft border-brand-accent text-brand-text' : 'bg-brand-bg border-brand-border text-brand-text hover:bg-brand-soft-2'
                }`}>
                {on && <Check className="w-3.5 h-3.5 text-brand-accent shrink-0" aria-hidden />}
                {REASON_RU[r]}
              </button>
            )
          })}
        </div>

        <label htmlFor="exit-survey-own" className="block text-sm font-medium text-brand-text mt-5 mb-2">{EXIT_COPY.ownLabel}</label>
        <textarea id="exit-survey-own" rows={3} maxLength={OTHER_MAX} value={other} onChange={e => setOther(e.target.value)}
          placeholder={EXIT_COPY.ownPlaceholder} className="input resize-y text-sm" />
        {other.length >= COUNTER_FROM && (
          <p className="text-xs text-brand-muted mt-1 text-right" aria-live="polite">{other.length} из {OTHER_MAX}</p>
        )}

        <label className="min-h-11 flex items-start gap-3 mt-4 text-sm text-brand-text cursor-pointer">
          <input type="checkbox" checked={contact} onChange={e => setContact(e.target.checked)}
            className="w-5 h-5 mt-0.5 shrink-0 accent-brand-accent cursor-pointer" />
          <span>
            {EXIT_COPY.contact}
            <span className="block text-xs text-brand-muted mt-0.5">{EXIT_COPY.contactHint}</span>
          </span>
        </label>

        <div className="mt-5 space-y-2">
          {errorLine}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <button type="button" onClick={() => (empty ? setTriedEmpty(true) : sendAnswer())} disabled={!!sending} aria-disabled={empty}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto h-11 px-6 rounded-2xl bg-brand-accent text-white font-semibold text-sm hover:bg-brand-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2">
              {sending === 'answer' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {EXIT_COPY.send}
            </button>
            <button type="button" onClick={later} disabled={!!sending} className={`${textBtn} w-full sm:w-auto`}>{EXIT_COPY.later}</button>
          </div>
          {empty && triedEmpty && <p className="text-xs text-brand-muted" aria-live="polite">{EXIT_COPY.emptyHint}</p>}
        </div>
      </div>
    </section>
  )
}
