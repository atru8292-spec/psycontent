'use client'

// Правая колонка «Написать» на компьютере (макеты A1, A5): «Ритм месяца» и «План тем». Остатка тут нет, он внизу меню.
// RhythmStrip: та же мера одной строкой на телефоне (A3).
// Ритм не геймификация: пропуск ничем не наказывается, слов «серия», «потеряно», «сгорит» нет (словарь 17.11, раздел 5).

import { QUIET_BTN, QUIET_BTN_SM } from '@/lib/ui-classes'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { track } from '@/lib/track'
import { formatOne, planFormat } from './formats'
import { RHYTHM_GOAL, planDayToPick, type PlanView, type Rhythm } from './useDesk'
import type { TopicPick } from './Composer'

const PLAN_HREF = '/dashboard/content-plan'

export function rhythmCaption(r: Rhythm): string {
  if (r.written === 0 && r.inBlog === 0) return 'В этом месяце текстов пока нет. Ритм начнется с первого.'
  if (r.inBlog === 0) return 'В блоге пока ничего не отмечено. Выложишь, нажми «Уже в блоге»'
  if (r.inBlog < RHYTHM_GOAL) return `${r.inBlog} из ${RHYTHM_GOAL} в блоге, ритм складывается`
  if (r.inBlog === RHYTHM_GOAL) return `${RHYTHM_GOAL} из ${RHYTHM_GOAL}. Ритм есть`
  return `${r.inBlog} в блоге за месяц. Ритм есть`
}

function Segments({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`flex gap-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: RHYTHM_GOAL }).map((_, i) => (
        <span key={i} className={`flex-1 h-2.5 rounded-full border ${i < Math.min(n, RHYTHM_GOAL) ? 'bg-brand-lilac border-brand-text' : 'bg-white border-brand-border-soft'}`} />
      ))}
    </span>
  )
}

export function RhythmCard({ rhythm }: { rhythm: Rhythm | null }) {
  const r = rhythm || { written: 0, inBlog: 0 }
  return (
    <section aria-labelledby="rhythm-h" className="rounded-[20px] bg-brand-soft px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="rhythm-h" className="text-[18px] leading-[26px] font-semibold text-brand-text">Ритм месяца</h2>
        {(r.written > 0 || r.inBlog > 0) && <span className="text-[13px] text-brand-muted">цель {RHYTHM_GOAL}</span>}
      </div>
      <Segments n={r.inBlog} className="mt-3 mb-2.5" />
      <p className="text-[14px] leading-5 text-brand-text">{rhythm ? rhythmCaption(r) : 'Ритм месяца загружается'}</p>
      {r.written > 0 && <p className="mt-0.5 text-[13px] leading-[18px] text-brand-muted">написано за месяц: {r.written}</p>}
    </section>
  )
}

// Телефон: одна строка «Ритм месяца [сегменты] 3 из 4 в блоге»
export function RhythmStrip({ rhythm }: { rhythm: Rhythm | null }) {
  if (!rhythm) return null
  const short = rhythm.inBlog === 0 && rhythm.written === 0 ? 'начнется с первого текста' : `${rhythm.inBlog} из ${RHYTHM_GOAL} в блоге`
  return (
    <div className="flex items-center gap-3 min-w-0" aria-label={`Ритм месяца: ${rhythmCaption(rhythm)}`} role="group">
      <span className="text-[15px] font-semibold text-brand-text shrink-0">Ритм месяца</span>
      <Segments n={rhythm.inBlog} className="w-[92px] shrink-0" />
      <span className="min-w-0 truncate text-[14px] text-brand-muted">{short}</span>
    </div>
  )
}

export function PlanCard({ plan, onPick, current }: { plan: PlanView | null | undefined; onPick: (t: TopicPick) => void; current?: string }) {
  if (plan === undefined) return <section aria-busy="true" className="rounded-[20px] bg-brand-card shadow-[0_1px_2px_rgba(59,42,34,.05)] h-[200px]" />
  if (!plan || !plan.today) {
    return (
      <section aria-labelledby="plan-h" className="rounded-[20px] bg-brand-card px-5 py-5 shadow-[0_1px_2px_rgba(59,42,34,.05)]">
        <h2 id="plan-h" className="text-[18px] leading-[26px] font-semibold text-brand-text">План тем</h2>
        <p className="mt-2 text-[14px] leading-5 text-brand-muted">
          {plan && !plan.today ? 'Все темы плана уже написаны. Новый план соберется за минуту.' : 'Плана тем пока нет. Соберется под то, с чем ты работаешь, за минуту: о чем писать и с какой первой строки.'}
        </p>
        <Link href={PLAN_HREF} onClick={() => track('feature_open', { feature: 'plan' })}
          className={`mt-4 ${QUIET_BTN}`}>
          Составить план тем
        </Link>
      </section>
    )
  }
  const rows = [plan.prev, plan.today, ...plan.next].filter(Boolean) as NonNullable<PlanView['today']>[]
  return (
    <section aria-labelledby="plan-h" className="rounded-[20px] bg-brand-card px-2.5 pt-4 pb-3 shadow-[0_1px_2px_rgba(59,42,34,.05)]">
      <div className="flex items-center justify-between gap-3 px-3 pb-1.5">
        <h2 id="plan-h" className="text-[18px] leading-[26px] font-semibold text-brand-text">План тем</h2>
        <Link href={PLAN_HREF} onClick={() => track('feature_open', { feature: 'plan' })}
          className={`-my-1 shrink-0 ${QUIET_BTN_SM}`}>Весь план</Link>
      </div>
      <ul>
        {rows.map(d => {
          const isToday = d === plan.today
          const f = planFormat(d.format)
          const inField = !!current && current.trim() === d.topic.trim()
          const inner = (
            <>
              <span className="w-11 shrink-0 text-[13px] leading-[18px] font-medium text-brand-muted">день {d.day}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[15px] leading-[22px] font-medium ${d.done ? 'text-brand-muted' : 'text-brand-text'}`}>{d.topic}</span>
                <span className="flex items-center gap-1.5 text-[13px] leading-[18px] text-brand-muted">
                  {f ? formatOne(f) : 'пост'}
                  {isToday && <span className="px-2 rounded-full bg-brand-soft text-brand-text">сегодня</span>}
                  {inField && <span className="text-brand-accent">в поле</span>}
                </span>
              </span>
              {d.done && <Check className="w-4 h-4 text-brand-accent shrink-0" aria-label="Написано" />}
            </>
          )
          return (
            <li key={d.day}>
              {d.done ? (
                <div className="flex items-center gap-3 min-h-11 px-3 py-2.5 rounded-xl">{inner}</div>
              ) : (
                <button type="button" onClick={() => onPick(planDayToPick(d))} aria-label={`Взять тему дня ${d.day}: ${d.topic}`}
                  className={`w-full text-left flex items-center gap-3 min-h-11 px-3 py-2.5 rounded-xl cursor-pointer transition ${isToday ? 'bg-brand-soft-2' : 'hover:bg-brand-bg'}`}>
                  {inner}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function RightColumn({ rhythm, plan, onPick, current }: { rhythm: Rhythm | null; plan: PlanView | null | undefined; onPick: (t: TopicPick) => void; current?: string }) {
  return (
    <aside className="hidden xl:block w-[360px] shrink-0 pt-1.5 space-y-5" aria-label="Ритм и план тем">
      <RhythmCard rhythm={rhythm} />
      <PlanCard plan={plan} onPick={onPick} current={current} />
    </aside>
  )
}
