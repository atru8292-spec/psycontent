// Опрос при уходе в кабинете (аналитика 2, SPEC B1): блок «Почему уходят» на Сводке и секция в карточке человека.
// Компоненты только рисуют готовые данные (пропом), грузят их страницы /admin через lib/analytics/admin-a2.ts.
// Так их можно показать на /preview/analitika с демо-данными без входа. Почт тут нет, свои слова есть
// (люди написали их нам), ссылка ведет в карточку человека.

import { ADMIN_EXIT, REASON_RU } from '@/lib/analytics/exit-copy'
import { visibleReasons, type ExitPlace } from '@/lib/analytics/exit-survey'
import type { ExitReach, ExitStats, PersonExit, ExitAnswer } from '@/lib/analytics/admin-a2'
import type { AdminOpts } from '@/lib/analytics/admin-types'
import { plural } from '@/lib/analytics/definitions'
import { PERIOD_RU } from '@/lib/analytics/admin-view'
import { paymentsOpenForAll } from '@/lib/billing/ready'
import { Card, Section, Note, Bar, Flag, LoadError, href, num, whenDay } from './ui'

export const PLACE_RU: Record<ExitPlace, string> = { cooling: 'на главной, после перерыва', delete: 'перед удалением', cancel: 'при отмене подписки', stuck: 'в начале, без первого текста' }
const NO_TABLE = 'Блок заработает, когда применишь миграцию 20261024110000_exit_surveys.sql'
const OWN_SHOWN = 5

const isPauseOnly = (a: ExitAnswer) => a.reasons.length > 0 && a.reasons.every(r => r === 'pause') && !a.other_text
const reasonsLine = (a: ExitAnswer) => a.reasons.filter(r => r !== 'pause' || a.reasons.length === 1).map(r => REASON_RU[r] || r).join(', ')

export function ExitSummary({ d, error, o, tz, now }: { d: ExitStats | null; error: null | 'no_migration' | 'failed'; o: AdminOpts; tz: string; now: Date }) {
  if (error === 'no_migration') return <Section title={ADMIN_EXIT.title}><Note>{NO_TABLE}</Note></Section>
  if (error || !d) return <Section title={ADMIN_EXIT.title}><LoadError kind="failed" /></Section>

  // ответы «Где все застопорилось?» (stuck) это не уход: считаем отдельно и с причинами ухода не смешиваем
  const leave = d.answers.filter(a => a.place !== 'stuck')
  const stuck = d.answers.filter(a => a.place === 'stuck')
  const pauses = leave.filter(a => a.reasons.includes('pause')).length
  // причины считаем от ответов, где назвали хоть что-то кроме паузы
  const real = leave.filter(a => !isPauseOnly(a))
  const own = d.answers.filter(a => a.other_text)
  // охват у каждого опроса свой: общей суммы нет (Арина 24.10)
  const Reach = ({ r, pause }: { r: ExitReach; pause?: number }) => (
    <p className="text-[13px] text-brand-muted flex flex-wrap gap-x-4 gap-y-1 mb-3">
      <span>показали <b className="font-semibold text-brand-text">{num(r.shown)}</b></span>
      <span>ответили <b className="font-semibold text-brand-text">{num(r.sent)}</b></span>
      {pause !== undefined && <span title={ADMIN_EXIT.pauses}>пауза <b className="font-semibold text-brand-text">{num(pause)}</b></span>}
      <span>закрыли <b className="font-semibold text-brand-text">{num(r.dismissed)}</b></span>
    </p>
  )
  const anything = d.answers.length || d.leave.shown || d.stuck.shown

  return (
    <Section title={ADMIN_EXIT.title} aside={PERIOD_RU[o.period]}>
      {!anything ? <Card className="p-5"><p className="text-brand-muted">{ADMIN_EXIT.empty}</p></Card> : (
        <Card className="grid lg:grid-cols-2 lg:divide-x divide-brand-border">
          <div className="p-4 lg:p-5 min-w-0">
            <h3 className="font-semibold mb-1">{ADMIN_EXIT.leave}</h3>
            <Reach r={d.leave} pause={pauses} />
            {!leave.length ? <p className="text-brand-muted text-[13px]">Пока не отвечали</p>
              : !real.length ? <p className="text-brand-muted text-[13px]">Все ответившие отметили паузу</p>
              : <ReasonList list={real} place="cooling" />}
            {(d.stuck.shown > 0 || stuck.length > 0) && (
              <div className="mt-6 pt-5 border-t border-brand-border">
                <h3 className="font-semibold mb-1">{ADMIN_EXIT.stuck}</h3>
                <Reach r={d.stuck} />
                {stuck.length ? <ReasonList list={stuck} place="stuck" /> : <p className="text-brand-muted text-[13px]">Пока не отвечали</p>}
              </div>
            )}
          </div>
          <div className="p-4 lg:p-5 min-w-0 border-t lg:border-t-0 border-brand-border">
            <h3 className="font-semibold mb-1">{ADMIN_EXIT.ownWords}</h3>
            {!own.length ? <p className="text-brand-muted text-[13px] mt-2">{ADMIN_EXIT.ownEmpty}</p> : (
              <>
                <OwnList list={own.slice(0, OWN_SHOWN)} o={o} tz={tz} now={now} />
                {own.length > OWN_SHOWN && (
                  <details className="group">
                    <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer inline-flex items-center min-h-11 text-[14px] underline underline-offset-4 rounded-lg focus-visible:outline-2 outline-brand-accent">
                      Еще ответы ({own.length - OWN_SHOWN})
                    </summary>
                    <OwnList list={own.slice(OWN_SHOWN)} o={o} tz={tz} now={now} />
                  </details>
                )}
              </>
            )}
          </div>
        </Card>
      )}
      <p className="text-[13px] text-brand-muted">{ADMIN_EXIT.note}</p>
    </Section>
  )
}

// причины по убыванию, нули в конце без полоски; проценты от ответов этого списка
function ReasonList({ list, place }: { list: ExitAnswer[]; place: ExitPlace }) {
  // «дорого» в списке, когда оплата открыта всем (тот же признак, что у лендинга) или кто-то уже так ответил
  // (тестовые почты при PAY_ONLY_EMAILS видят эту причину раньше остальных)
  const withPrice = paymentsOpenForAll() || list.some(a => a.reasons.includes('expensive'))
  const counts = visibleReasons(withPrice, place).map(r => ({ r, n: list.filter(a => a.reasons.includes(r)).length }))
    .sort((a, b) => b.n - a.n)
  const max = Math.max(1, ...counts.map(c => c.n))
  return (
    <ul className="space-y-3">
      {counts.map(c => (
        <li key={c.r} className="space-y-1">
          <div className={`flex justify-between gap-3 ${c.n ? '' : 'text-brand-muted'}`}>
            <span className="min-w-0">{REASON_RU[c.r]}</span>
            <span className="text-[13px] shrink-0 text-brand-muted">{c.n} · {Math.round((c.n / list.length) * 100)}%</span>
          </div>
          {c.n > 0 && <Bar value={c.n} max={max} />}
        </li>
      ))}
    </ul>
  )
}

function OwnList({ list, o, tz, now }: { list: ExitAnswer[]; o: AdminOpts; tz: string; now: Date }) {
  return (
    <ul className="divide-y divide-brand-border">
      {list.map(a => (
        <li key={a.id} className="py-3 space-y-1.5">
          <p className="whitespace-pre-line [overflow-wrap:anywhere]">{a.other_text}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-brand-muted">
            <span>{whenDay(a.created_at, tz, now)}</span>
            <span>{PLACE_RU[a.place] || a.place}</span>
            {a.reasons.length > 0 && <span className="min-w-0 [overflow-wrap:anywhere]">{reasonsLine(a)}</span>}
            {a.can_contact && <Flag>{ADMIN_EXIT.contact}</Flag>}
            <a href={href(`/admin/people/${a.user_id}`, o)} className="inline-flex items-center min-h-11 lg:min-h-0 text-brand-text underline underline-offset-4">к человеку</a>
          </div>
        </li>
      ))}
    </ul>
  )
}

// Карточка человека. Опрос не показывали: секции нет (страница рендерит null).
export function PersonExitSection({ d, tz, now }: { d: PersonExit; tz: string; now: Date }) {
  if (!d.answers.length && !d.shownAt) return null
  return (
    <Section title="Опрос при уходе">
      <Card className="p-4 lg:p-5">
        {!d.answers.length ? (
          <p>Видела опрос {whenDay(d.shownAt, tz, now)}{d.dismissedAt ? ', закрыла' : ', не ответила'}</p>
        ) : (
          <ul className="divide-y divide-brand-border">
            {d.answers.map(a => (
              <li key={a.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                <p className="text-[13px] text-brand-muted">{whenDay(a.created_at, tz, now)} · {PLACE_RU[a.place] || a.place}</p>
                {a.reasons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {a.reasons.map(r => <span key={r} className="max-w-full [&>span]:whitespace-normal [&>span]:h-auto [&>span]:min-h-6 [&>span]:py-0.5"><Flag>{REASON_RU[r] || r}</Flag></span>)}
                  </div>
                )}
                {a.other_text && <p className="whitespace-pre-line [overflow-wrap:anywhere]">{a.other_text}</p>}
                <p className="text-[13px]">можно написать: {a.can_contact ? 'да' : 'нет'}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  )
}
