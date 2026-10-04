// Сводка: главная плитка «Взяли текст», остальные плитки, «Требуют внимания», воронка с «Кто тут застрял».
import { adminTz, requireAdmin } from '@/lib/admin'
import { optsFrom, loadOverview, loadFunnel, loadPeople, loadLanding, type LandingStats } from '@/lib/analytics/admin-data'
import { FUNNEL_RU, type FunnelStep, type PersonRow, type AdminOpts } from '@/lib/analytics/admin-types'
import { reasonText, share, plural } from '@/lib/analytics/definitions'
import { PERIOD_RU, filterPeople } from '@/lib/analytics/admin-view'
import { Card, Section, Note, RiskPill, StatusBadge, PageHead, RowLink, LoadError, href, rub, num, whenDay, hours } from '@/components/admin/ui'

type SP = Promise<Record<string, string | string[] | undefined>>

export default async function AdminHome({ searchParams }: { searchParams: SP }) {
  await requireAdmin()
  const o = optsFrom(await searchParams)
  const tz = adminTz()
  const now = new Date()
  const [ov, fu, pe, la] = await Promise.all([loadOverview(o), loadFunnel(o), loadPeople(o), loadLanding(o)])
  const err = ov.error || fu.error || pe.error
  const sub = `Воронка ${PERIOD_RU[o.period]}, плитки за свои сроки · ${o.includeInternal ? 'со служебными' : 'без служебных'}`

  return (
    <>
      <PageHead title="Сводка" sub={sub} o={o} path="/admin" period exportQuery={{ what: 'overview' }} zip />
      {err || !ov.data || !fu.data || !pe.data ? <LoadError kind={err === 'no_migration' ? 'no_migration' : 'failed'} /> : (
        <div className="space-y-6 lg:space-y-8">
          <Tiles d={ov.data} />
          <LandingRow d={la.data} />
          <Attention people={pe.data} o={o} tz={tz} now={now} />
          <Funnel steps={fu.data} people={pe.data} o={o} tz={tz} now={now} empty={!pe.data.some(p => p.last_visit_at)} />
        </div>
      )}
    </>
  )
}

function Tile({ label, value, foot, className = '' }: { label: string; value: React.ReactNode; foot?: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-4 lg:p-5 min-h-[124px] flex flex-col justify-between gap-3 ${className}`}>
      <div className="text-[13px] text-brand-muted">{label}</div>
      <div className="text-[28px] lg:text-[32px] font-semibold leading-none">{value}</div>
      {foot && <div className="text-[13px] text-brand-muted">{foot}</div>}
    </Card>
  )
}

// Строка про лендинг: уникальные посещения (session_id) за 7 дней
function LandingRow({ d }: { d: LandingStats | null }) {
  return (
    <Card className="px-4 lg:px-5 py-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
      <span className="font-medium">Лендинг за 7 дней</span>
      {d ? (
        <>
          <span>заходы <b className="font-semibold">{num(d.views)}</b></span>
          <span>нажали кнопку <b className="font-semibold">{num(d.clicks)}</b></span>
          <span>оставили мысль в демо <b className="font-semibold">{num(d.demo)}</b></span>
        </>
      ) : <span className="text-brand-muted text-[13px]">цифры не загрузились</span>}
    </Card>
  )
}

function Tiles({ d }: { d: NonNullable<Awaited<ReturnType<typeof loadOverview>>['data']> }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
      <Card className="col-span-2 lg:row-span-2 p-5 lg:p-6 min-h-[160px] lg:min-h-[264px] flex flex-col justify-between gap-4">
        <div className="text-[13px] text-brand-muted">Взяли текст за 7 дней</div>
        <div>
          <div className="text-[56px] lg:text-[72px] font-semibold leading-none text-brand-accent">{num(d.took_7)}</div>
          <div className="mt-2">{share(d.took_7, d.registered_all)} {d.registered_all < 20 ? plural(d.registered_all, 'зарегистрированной', 'зарегистрированных', 'зарегистрированных') : 'от всех регистраций'}</div>
        </div>
        <div className="text-[13px] text-brand-muted">Сколько людей хоть раз скопировали, сохранили или опубликовали материал</div>
      </Card>
      <Tile label="Активные" value={<>{num(d.active_today)} <span className="text-brand-muted font-normal">/</span> {num(d.active_7)}</>} foot="сегодня / за 7 дней" />
      <Tile label="Новые за 7 дней" value={num(d.new_7)} foot={`всего ${num(d.registered_all)}`} />
      <Tile label="Дошли до активации" value={share(d.activated_all, d.registered_all)} foot="взяли текст в первые 3 дня" />
      <Tile className="col-span-2 max-lg:order-last" label="Траты на ИИ" value={<>{rub(d.cost_today_rub)} <span className="text-brand-muted font-normal">/</span> {rub(d.cost_30_rub)}</>} foot="сегодня / за 30 дней" />
      <Tile label="Упирались в лимит за 7 дней" value={num(d.limit_7)} />
    </div>
  )
}

function Attention({ people, o, tz, now }: { people: PersonRow[]; o: AdminOpts; tz: string; now: Date }) {
  const list = filterPeople(people, '', 'attention', 'risk')
  const stuck = people.filter(p => p.churn.status === 'stuck' && p.churn.score < 30)
  const rows = [...list, ...stuck]
  const shown = rows.slice(0, 8)
  return (
    <Section title="Требуют внимания" aside={rows.length ? `${rows.length} ${plural(rows.length, 'человек', 'человека', 'человек')}` : undefined}>
      <Card className="overflow-hidden">
        {!rows.length ? <p className="p-5 text-brand-muted">Сейчас никто не в зоне риска</p> : (
          <div className="divide-y divide-brand-border">
            {shown.map(p => {
              const r = p.churn.reasons.filter(x => x.points > 0)
              const why = r.length ? reasonText(r[0], p.churn.facts, p.churn, now) : p.churn.status === 'stuck' ? `${p.onb_done ? 'нет материалов' : 'не прошла онбординг'}, с ${whenDay(p.registered_at, tz, now)}` : ''
              return (
                <RowLink key={p.user_id} href={href(`/admin/people/${p.user_id}`, o)}>
                  {p.churn.score >= 30 ? <RiskPill score={p.churn.score} level={p.churn.level} /> : <span className="w-11 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.email}</div>
                    <div className="text-[13px] text-brand-muted line-clamp-2 sm:truncate flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="sm:hidden"><StatusBadge status={p.churn.status} /></span>
                      <span>{why}</span>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex"><StatusBadge status={p.churn.status} /></span>
                </RowLink>
              )
            })}
          </div>
        )}
      </Card>
      {rows.length > shown.length && <a href={href('/admin/people', o, { f: 'attention' })} className="inline-flex items-center min-h-11 text-[14px] underline underline-offset-4">Показать всех ({rows.length})</a>}
    </Section>
  )
}

function Funnel({ steps, people, o, tz, now, empty }: { steps: FunnelStep[]; people: PersonRow[]; o: AdminOpts; tz: string; now: Date; empty: boolean }) {
  const top = steps[0]?.n || 0
  const byId = new Map(people.map(p => [p.user_id, p]))
  // застряли на шаге: дошли до него, но не до следующего
  const stuckAt = steps.map((s, i) => {
    const next = new Set(steps[i + 1]?.users || [])
    return i < steps.length - 1 ? s.users.filter(u => !next.has(u)) : []
  })
  // дошли до шага = люди прошлого шага, которые есть и на этом (шаги не вложены: тарифы видят и без второго текста)
  const reached = steps.map((s, i) => (i === 0 ? s.n : steps[i - 1].n - stuckAt[i - 1].length))
  // узкое место: самая большая доля ушедших с шага; при ничьей метку не ставим
  const drops = steps.slice(0, -1).map((s, i) => (s.n ? stuckAt[i].length / s.n : 0))
  const maxDrop = Math.max(0, ...drops)
  const worst = maxDrop > 0 && drops.filter(d => d === maxDrop).length === 1 ? drops.indexOf(maxDrop) : -1

  return (
    <Section title="Воронка" aside={PERIOD_RU[o.period]}>
      {empty && <Note>Событий пока нет, они начнут копиться, когда новая версия выйдет на сайт. Регистрации и материалы видны уже сейчас, их берем из базы.</Note>}
      <Card className="p-4 lg:p-5">
        <ol className="space-y-1">
          {steps.map((s, i) => {
            const pct = top ? Math.round((s.n / top) * 100) : 0
            const stuck = stuckAt[i]
            const prev = steps[i - 1]
            const last = i === steps.length - 1
            const row = (
              <div className="grid grid-cols-[1fr_auto] lg:grid-cols-[220px_1fr_64px_200px] items-center gap-x-4 gap-y-2 min-h-12 py-1">
                <span>{FUNNEL_RU[s.key]}</span>
                <span className="lg:order-3 text-right font-semibold">{num(s.n)}</span>
                <span className="col-span-2 lg:col-span-1 lg:order-2 h-2.5 rounded-full bg-brand-soft-2 overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-full bg-brand-accent" style={{ width: `${Math.max(s.n ? 2 : 0, pct)}%` }} />
                </span>
                {last ? <span className="hidden lg:block lg:order-4" /> : stuck.length ? (
                  <span className="col-span-2 lg:col-span-1 lg:order-4 text-[13px] text-brand-muted underline-offset-4 group-hover:underline min-h-11 lg:min-h-0 inline-flex items-center">
                    Кто тут застрял ({stuck.length})
                  </span>
                ) : <span className="hidden lg:inline lg:order-4 text-[13px] text-brand-muted">никто не застрял</span>}
              </div>
            )
            return (
              <li key={s.key}>
                {i > 0 && (
                  <div className="lg:pl-[236px] py-1 text-[13px] text-brand-muted flex flex-wrap items-center gap-2">
                    <span>дошли {share(reached[i], prev.n)}{s.median_hours_from_prev !== null ? ` · медиана ${hours(s.median_hours_from_prev)}` : ''}</span>
                    {worst === i - 1 && <span className="bg-brand-soft rounded px-1.5 text-brand-text">больше всего уходят тут</span>}
                  </div>
                )}
                {last || !stuck.length ? row : (
                <details name="funnel" className="group">
                  <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer rounded-lg focus-visible:outline-2 outline-brand-accent">{row}</summary>
                  <div className="lg:ml-[236px] mb-2 rounded-xl bg-brand-soft-2">
                    <ul className="divide-y divide-brand-border/70">
                      {stuck.slice(0, 10).map(u => {
                        const p = byId.get(u)
                        return (
                          <li key={u}>
                            <a href={href(`/admin/people/${u}`, o)} className="flex flex-wrap items-center gap-x-3 px-3 min-h-11 py-2 hover:underline underline-offset-4">
                              <span className="font-medium truncate max-w-full">{p?.email || 'служебный или скрытый аккаунт'}</span>
                              {p && <span className="text-[13px] text-brand-muted">последний визит {whenDay(p.last_visit_at, tz, now)}</span>}
                            </a>
                          </li>
                        )
                      })}
                    </ul>
                    {stuck.length > 10 && <a href={href('/admin/people', o)} className="block px-3 py-2 text-[13px] underline underline-offset-4">Еще {stuck.length - 10} в списке людей</a>}
                  </div>
                </details>
                )}
              </li>
            )
          })}
        </ol>
      </Card>
    </Section>
  )
}
