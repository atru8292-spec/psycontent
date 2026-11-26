'use client'

// Карточка помощи над полем «О чем сегодня?» (26.11, решение Арины: вместо опроса «почему уходишь» помощь,
// голос команды, без скидок). Два случая решает сервер (GET /api/exit-survey):
// stuck: 3+ дня с регистрации и ни одного взятого текста, один раз за все время;
// cooling: остывала или ушла и вернулась (пауза между показами и не больше 3 показов, decideSurvey).
// Своей кнопки «написать» у карточки нет (дизайнер и ревью 26.11): она дублировала главную «Написать · 1 текст»
// и списывала текст без пометки. Карточка объясняет, что пустое поле дает готовую тему, и ведет в «Помощь»
// (там бот получает метку аккаунта, команда видит, кто пишет).
// Показ отмечается, только когда карточка уже на экране (POST action shown, сервер перепроверяет решение,
// пишет exit_survey_shown с kind help); не записалось: карточку не показываем. Проверка не чаще раза
// в 30 минут на вкладку (sessionStorage), чтобы возврат к вводу не дергал analytics_churn каждый раз.
// Показываем, только пока человек ничего не начал вводить (skip): поздно появившаяся карточка сдвигала бы поле.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { track } from '@/lib/track'

type Place = 'stuck' | 'cooling'
const TEXTS: Record<Place, { h: string; p: string }> = {
  stuck: { h: 'Не знаешь, с чего начать?', p: 'Оставь поле пустым и нажми «Написать», тему подберем из того, с чем ты работаешь.' },
  cooling: { h: 'С возвращением, все на месте', p: 'Просто нажми «Написать», тему подберем под твою практику.' },
}
const CHECKED_KEY = 'psy_help_checked'
const CHECK_EVERY_MS = 30 * 60 * 1000
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent'

function recentlyChecked(): boolean {
  try { const t = Number(sessionStorage.getItem(CHECKED_KEY) || 0); return Date.now() - t < CHECK_EVERY_MS } catch { return false }
}
function markChecked() { try { sessionStorage.setItem(CHECKED_KEY, String(Date.now())) } catch {} }

export default function HelpCard({ skip, onClose }: { skip: () => boolean; onClose?: () => void }) {
  const [place, setPlace] = useState<Place | null>(null)
  // эффект с пустыми зависимостями: без ref skip из первого рендера видел бы пустую мысль (ревью 26.11)
  const skipRef = useRef(skip)
  skipRef.current = skip

  useEffect(() => {
    if (recentlyChecked()) return
    let on = true
    fetch('/api/exit-survey').then(r => (r.ok ? r.json() : null)).then(async d => {
      if (!on) return
      markChecked()
      if (!d?.show || (d.place !== 'stuck' && d.place !== 'cooling') || skipRef.current()) return
      const r = await fetch('/api/exit-survey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'shown', place: d.place }) }).catch(() => null)
      if (on && r?.ok) setPlace(d.place)
    }).catch(() => {})
    return () => { on = false }
  }, [])

  if (!place) return null
  const t = TEXTS[place]

  return (
    <aside aria-labelledby="help-card-h" className="relative mb-5 rounded-2xl bg-brand-soft-2 border border-brand-border-soft pl-4 pr-12 py-3.5 lg:pl-5 lg:py-4">
      <p id="help-card-h" className="text-[16px] leading-6 font-semibold text-brand-text">{t.h}</p>
      <p className="mt-0.5 text-[15px] leading-[22px] text-brand-text-secondary">{t.p}</p>
      <p className="mt-1.5 text-[14px] leading-5 text-brand-text-secondary">
        Что-то не получается?{' '}
        <Link href="/dashboard/pomosch" onClick={() => track('help_card_click', { place, to: 'support' })}
          className={`font-semibold text-brand-text underline underline-offset-2 rounded ${FOCUS}`}>Напиши нам</Link>
      </p>
      <button type="button" onClick={() => { track('help_card_click', { place, to: 'close' }); setPlace(null); onClose?.() }} aria-label="Закрыть" title="Закрыть"
        className={`absolute top-1 right-1 w-11 h-11 rounded-xl flex items-center justify-center text-brand-muted hover:text-brand-text hover:bg-brand-soft cursor-pointer ${FOCUS}`}>
        <X className="w-[18px] h-[18px]" />
      </button>
    </aside>
  )
}
