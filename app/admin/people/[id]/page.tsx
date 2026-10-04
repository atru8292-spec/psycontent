// Карточка человека: риск с причинами, онбординг по шагам, лента по дням, функции, голос, деньги. Текстов постов нет.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { adminTz, requireAdmin } from '@/lib/admin'
import { optsFrom, loadPerson } from '@/lib/analytics/admin-data'
import type { PersonDetail, AdminOpts } from '@/lib/analytics/admin-types'
import { RISK_LEVEL_RU, reasonText, fmtNum, plural } from '@/lib/analytics/definitions'
import { FEATURE_RU, formatRu, opRu, srcRu, voiceKindRu, timelineLine, onbStepRu } from '@/lib/analytics/admin-view'
import { Card, Section, RiskPill, StatusBadge, PageHead, DownloadLink, LoadError, Bar, href, rub, when, dayKey, dayLabel, timeOf, duration } from '@/components/admin/ui'

type Params = Promise<{ id: string }>
type SP = Promise<Record<string, string | string[] | undefined>>

export default async function PersonPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const sp = await searchParams
  const o = optsFrom(sp)
  const tz = adminTz()
  const now = new Date()
  const r = await loadPerson(o, id)
  if (r.error) return <><Back o={o} /><div className="mt-4"><LoadError kind={r.error} /></div></>
  if (!r.data) notFound()
  const p = r.data
  const full = (Array.isArray(sp.full) ? sp.full[0] : sp.full) === '1'

  return (
    <>
      <Back o={o} />
      <PageHead title={p.email} o={o} path={`/admin/people/${id}`} exportQuery={{ what: 'person', id }} exportDesktopOnly />
      <Head p={p} tz={tz} now={now} />
      <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:items-start">
        <div className="order-2 lg:order-1"><Timeline p={p} tz={tz} now={now} o={o} full={full} /></div>
        <div className="contents lg:block lg:order-2 lg:space-y-4">
          <div className="order-1"><Onboarding p={p} /></div>
          <div className="order-3"><Uses p={p} /></div>
          <div className="order-4"><Voice p={p} /></div>
          <div className="order-5"><Money p={p} /></div>
        </div>
      </div>
      <div className="lg:hidden mt-6"><DownloadLink href={href('/api/admin/export', o, { what: 'person', id })}>Скачать таблицу</DownloadLink></div>
    </>
  )
}

function Back({ o }: { o: AdminOpts }) {
  return <Link href={href('/admin/people', o)} className="inline-flex items-center gap-1 min-h-11 mt-3 text-brand-muted hover:text-brand-text"><ChevronLeft size={16} aria-hidden /> Все люди</Link>
}

function Head({ p, tz, now }: { p: PersonDetail; tz: string; now: Date }) {
  const c = p.churn
  const counted = (c.facts?.take_days?.length ?? 0) > 0
  const rhythm = c.rhythm_days
  return (
    <Card className="p-5 lg:p-6 flex flex-col gap-5 lg:flex-row lg:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={c.status} />
        </div>
        <p className="text-[13px] text-brand-muted">
          {[p.full_name, p.plan_name || 'нет тарифа', `с ${dayLabel(p.registered_at, tz, now)}`, `пришла: ${srcRu(p.src)}`, `последний визит ${when(p.last_visit_at, tz, now)}`].filter(Boolean).join(' · ')}
        </p>
        {counted && <p>Обычно берет текст {rhythm <= 1 ? 'каждый день' : `раз в ${fmtNum(rhythm)} ${plural(Math.round(rhythm), 'день', 'дня', 'дней')}`}</p>}
      </div>
      <div className="lg:w-[340px] shrink-0 space-y-2">
        <div className="flex items-center gap-3">
          <RiskPill score={c.score} level={c.level} counted={counted} big />
          <span className="font-medium">{counted ? RISK_LEVEL_RU[c.level] : 'риск не считаем, текстов еще не брала'}</span>
        </div>
        {counted && c.reasons.length > 0 && (
          <ul className="text-[13px] space-y-1">
            {c.reasons.map(x => (
              <li key={x.code} className={`flex justify-between gap-3 ${x.points < 0 ? 'text-brand-muted' : ''}`}>
                <span>{reasonText(x, c.facts, c, now)}</span><span className="shrink-0">{x.points > 0 ? `+${x.points}` : `−${Math.abs(x.points)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function Onboarding({ p }: { p: PersonDetail }) {
  const seen = p.onboarding.filter(s => s.viewed_at)
  const done = p.onboarding.filter(s => s.done_at)
  const lastSeen = seen[seen.length - 1]
  const leftAt = !p.done_at && lastSeen && !lastSeen.done_at ? lastSeen.step : null
  const total = p.onboarding.reduce((s, x) => s + (x.ms || 0), 0)
  return (
    <Section title="Онбординг">
      <Card className="p-4 lg:p-5 space-y-3">
        {!seen.length && !p.intro_at ? <p className="text-brand-muted">До онбординга не дошла</p> : (
          <>
            <p className="font-medium">{p.done_at ? `Онбординг пройден${total ? ` за ${duration(total)}` : ''}` : `Прошла ${done.length} из ${p.onboarding.length || 5} вопросов`}</p>
            <ol className="space-y-1">
              {p.onboarding.map(s => (
                <li key={s.step} className={`flex justify-between gap-3 min-h-10 items-center ${leftAt === s.step ? 'bg-brand-soft rounded-lg px-2 font-medium' : ''}`}>
                  <span>{s.step}. {onbStepRu(s.step)}</span>
                  <span className={`text-[13px] ${s.viewed_at ? '' : 'text-brand-muted'}`}>
                    {leftAt === s.step ? 'ушла здесь' : s.done_at ? `прошла${s.ms ? ` · ${duration(s.ms)}` : ''}` : s.viewed_at ? 'видела' : 'не видела'}
                  </span>
                </li>
              ))}
            </ol>
            {p.mic_denied && <p className="text-[13px] text-brand-muted">Микрофон браузер не дал</p>}
          </>
        )}
      </Card>
    </Section>
  )
}

function Timeline({ p, tz, now, o, full }: { p: PersonDetail; tz: string; now: Date; o: AdminOpts; full: boolean }) {
  const cutoff = now.getTime() - 7 * 86400000
  const items = full ? p.timeline : p.timeline.filter(t => Date.parse(t.at) >= cutoff)
  const hidden = p.timeline.length - items.length
  const days: { key: string; at: string; rows: typeof items }[] = []
  for (const t of items) {
    const k = dayKey(t.at, tz)
    const d = days[days.length - 1]
    if (d && d.key === k) d.rows.push(t); else days.push({ key: k, at: t.at, rows: [t] })
  }
  const dot = { take: 'bg-brand-accent', trouble: 'bg-brand-lilac ring-1 ring-brand-text/40', other: 'bg-brand-border' }
  return (
    <Section title="Лента">
      <Card className="p-4 lg:p-5">
        {!p.timeline.length ? <p className="text-brand-muted">Действий пока нет. Если она пришла до запуска аналитики, события пойдут с ее следующего визита</p> : (
          <div className="space-y-2">
            {!days.length && <p className="text-brand-muted text-[13px]">За последние 7 дней действий нет</p>}
            {days.map(d => (
              <div key={d.key}>
                <div className="sticky top-0 lg:top-14 bg-brand-card py-2 text-[13px] font-semibold first-letter:uppercase">{dayLabel(d.at, tz, now)}</div>
                <ul>
                  {d.rows.map((t, i) => {
                    const l = timelineLine(t)
                    return (
                      <li key={i} className="grid grid-cols-[48px_12px_1fr] gap-2 py-1.5 items-baseline">
                        <span className="text-[13px] text-brand-muted">{timeOf(t.at, tz)}</span>
                        <span className={`w-2 h-2 rounded-full self-center ${dot[l.kind]}`} aria-hidden />
                        <span className={l.kind === 'take' ? 'font-medium' : ''}>{l.text}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            {hidden > 0 && <Link href={href(`/admin/people/${p.user_id}`, o, { full: 1 })} className="inline-flex items-center h-11 px-4 rounded-xl border border-brand-border text-sm font-medium hover:bg-brand-soft-2">Показать более ранние ({hidden})</Link>}
          </div>
        )}
      </Card>
    </Section>
  )
}

function Uses({ p }: { p: PersonDetail }) {
  const rows = [
    ...p.formats.map(f => ({ k: `f_${f.format}`, label: formatRu(f.format), n: f.made, extra: `взяла ${f.taken}` })),
    ...p.features.map(f => ({ k: f.feature, label: FEATURE_RU[f.feature] || f.feature, n: f.n, extra: '' })),
  ].sort((a, b) => b.n - a.n)
  const max = Math.max(1, ...rows.map(r => r.n))
  return (
    <Section title="Чем пользуется">
      <Card className="p-4 lg:p-5">
        {!rows.length ? <p className="text-brand-muted">Пока ничего</p> : (
          <ul className="space-y-3">
            {rows.map(r => (
              <li key={r.k} className="space-y-1">
                <div className="flex justify-between gap-3"><span>{r.label}</span><span className="text-[13px] text-brand-muted">{r.n} {plural(r.n, 'раз', 'раза', 'раз')}{r.extra ? ` · ${r.extra}` : ''}</span></div>
                <Bar value={r.n} max={max} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  )
}

function Voice({ p }: { p: PersonDetail }) {
  const kinds = p.voice.by_kind.filter(k => k.n > 0).sort((a, b) => b.n - a.n)
  return (
    <Section title="Голос">
      <Card className="p-4 lg:p-5 space-y-3">
        <p>Слепок голоса: {p.churn.facts?.voice_core_empty ? 'пока нет' : 'есть'}</p>
        {!kinds.length ? <p className="text-brand-muted text-[13px]">Сигналов голоса пока нет</p> : (
          <ul className="space-y-1 text-[14px]">
            {kinds.map(k => <li key={k.kind} className="flex justify-between gap-3"><span>{voiceKindRu(k.kind)}</span><span>{k.n}</span></li>)}
          </ul>
        )}
      </Card>
    </Section>
  )
}

function Money({ p }: { p: PersonDetail }) {
  const m = p.money
  return (
    <Section title="Деньги">
      <Card className="p-4 lg:p-5 space-y-3">
        <p>За 30 дней <b className="font-semibold">{rub(m.rub_30)}</b> · за все время {rub(m.rub_all)}</p>
        {m.by_operation_30.length > 0 && (
          <ul className="space-y-1 text-[13px]">
            {m.by_operation_30.map(x => <li key={x.operation} className="flex justify-between gap-3"><span>{opRu(x.operation)}</span><span>{rub(x.rub)} · {x.calls}</span></li>)}
            {m.by_model_30.map(x => <li key={x.model} className="flex justify-between gap-3 text-brand-muted"><span>{x.model}</span><span>{rub(x.rub)}</span></li>)}
          </ul>
        )}
        {!m.rub_all && <p className="text-[13px] text-brand-muted">Трат пока нет</p>}
        {p.text_usage.cap ? <p className="text-[13px]">Текст: {p.text_usage.count} из {p.text_usage.cap} пробных</p> : null}
      </Card>
    </Section>
  )
}
