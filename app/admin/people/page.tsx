// Люди: поиск по почте, фильтр по статусу, сортировка. На телефоне карточки, на компьютере таблица.
import Link from 'next/link'
import { adminTz, requireAdmin } from '@/lib/admin'
import { optsFrom, loadPeople } from '@/lib/analytics/admin-data'
import type { PersonRow, AdminOpts } from '@/lib/analytics/admin-types'
import { STATUS_RU, share, plural } from '@/lib/analytics/definitions'
import { PEOPLE_FILTERS, SORT_RU, filterPeople, isFilter, isSort, stepOf, srcRu, type PeopleFilter, type PeopleSort } from '@/lib/analytics/admin-view'
import { Card, RiskPill, StatusBadge, Flag, PageHead, LoadError, href, rub, whenDay } from '@/components/admin/ui'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export default async function PeoplePage({ searchParams }: { searchParams: SP }) {
  await requireAdmin()
  const sp = await searchParams
  const o = optsFrom(sp)
  const q = one(sp.q).slice(0, 80)
  const f: PeopleFilter = isFilter(one(sp.f)) ? (one(sp.f) as PeopleFilter) : 'all'
  const s: PeopleSort = isSort(one(sp.s)) ? (one(sp.s) as PeopleSort) : 'risk'
  const tz = adminTz()
  const now = new Date()
  const r = await loadPeople(o)
  const list = r.data ? filterPeople(r.data, q, f, s) : []
  const state = { q, f, s }

  return (
    <>
      <PageHead title="Люди" sub={`${list.length} ${plural(list.length, 'человек', 'человека', 'человек')} · ${o.includeInternal ? 'со служебными' : 'без служебных'}`} o={o} path="/admin/people" exportQuery={{ what: 'people', q, f: f === 'all' ? '' : f, s: s === 'risk' ? '' : s }} />
      {r.error || !r.data ? <LoadError kind={r.error === 'no_migration' ? 'no_migration' : 'failed'} /> : (
        <div className="space-y-4">
          <form action="/admin/people" className="flex flex-wrap gap-2">
            {o.includeInternal && <input type="hidden" name="all" value="1" />}
            {o.demo && <input type="hidden" name="demo" value="1" />}
            {f !== 'all' && <input type="hidden" name="f" value={f} />}
            <input type="search" name="q" defaultValue={q} placeholder="Найти по почте" aria-label="Найти по почте"
              className="flex-1 min-w-0 h-11 lg:h-10 rounded-xl border border-brand-border bg-brand-card px-3 text-[16px] lg:text-[14px] focus-visible:outline-2 outline-brand-accent" />
            <select name="s" defaultValue={s} aria-label="Сортировка" className="lg:hidden order-last basis-full h-11 rounded-xl border border-brand-border bg-brand-card px-2 text-[14px]">
              {Object.entries(SORT_RU).map(([k, v]) => <option key={k} value={k}>Сортировать: {v}</option>)}
            </select>
            <button className="h-11 lg:h-10 px-4 rounded-xl border border-brand-border bg-brand-card text-sm font-medium hover:bg-brand-soft-2">Найти</button>
          </form>
          <nav aria-label="Статус" className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap [scrollbar-width:none]">
            {PEOPLE_FILTERS.map(x => (
              <Link key={x.id} href={href('/admin/people', o, { ...state, f: x.id === 'all' ? '' : x.id, s: s === 'risk' ? '' : s })} aria-current={f === x.id ? 'true' : undefined}
                className={`inline-flex items-center h-11 lg:h-9 px-4 rounded-full shrink-0 text-[14px] ${f === x.id ? 'bg-brand-accent text-white' : 'bg-brand-card border border-brand-border hover:bg-brand-soft-2'}`}>
                {x.label}
              </Link>
            ))}
          </nav>

          {!list.length ? (
            <Card className="p-5 text-brand-muted">
              {q ? 'Никого с такой почтой' : f !== 'all' ? (f === 'attention' ? 'Сейчас никто не в зоне риска' : `Сейчас никого в статусе «${STATUS_RU[f]}»`)
                : <>Пока никого, кроме служебных. Включи «Показать служебных», чтобы проверить экран</>}
            </Card>
          ) : (
            <>
              <div className="md:hidden space-y-3">{list.map(p => <PersonCard key={p.user_id} p={p} o={o} tz={tz} now={now} />)}</div>
              <PeopleTable list={list} o={o} tz={tz} now={now} state={state} />
            </>
          )}
        </div>
      )}
    </>
  )
}

function flags(p: PersonRow) {
  return <>{p.paying && <Flag>платит</Flag>}{p.limit_hit_ever && <Flag>лимит</Flag>}{p.error_7 && <Flag>ошибка</Flag>}</>
}

function PersonCard({ p, o, tz, now }: { p: PersonRow; o: AdminOpts; tz: string; now: Date }) {
  const counted = (p.churn.facts?.take_days?.length ?? 0) > 0 && p.churn.status !== 'gone'
  return (
    <Link href={href(`/admin/people/${p.user_id}`, o)} className="block p-4 rounded-2xl bg-brand-card border border-brand-border space-y-2 focus-visible:outline-2 outline-brand-accent">
      <div className="flex items-center gap-3">
        <span className="truncate font-medium flex-1 min-w-0">{p.email}</span>
        <RiskPill score={p.churn.score} level={p.churn.level} counted={counted} />
      </div>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={p.churn.status} /><span>{p.plan_name || 'нет тарифа'}</span>{flags(p)}</div>
      <div className="text-[13px]">визит {whenDay(p.last_visit_at, tz, now)} · {p.sessions_7} за 7 дн · взяла {p.materials_taken} из {p.materials}</div>
      <div className="text-[13px] text-brand-muted">шаг: {stepOf(p)} · {rub(p.cost_rub_30)} за 30 дн · пришла {whenDay(p.registered_at, tz, now)}, {srcRu(p.src)}</div>
    </Link>
  )
}

const COLS: { label: string; sort?: PeopleSort; w: string; right?: boolean }[] = [
  { label: 'Человек', sort: 'email', w: 'w-[208px]' }, { label: 'Статус', w: 'w-[108px]' }, { label: 'Риск', sort: 'risk', w: 'w-[64px]' },
  { label: 'Тариф', w: 'w-[96px]' }, { label: 'Шаг', w: 'w-[140px]' }, { label: 'Последний визит', sort: 'visit', w: 'w-[100px]' },
  { label: 'Визитов за 7 дн', w: 'w-[72px]', right: true }, { label: 'Дней из 30', w: 'w-[60px]', right: true },
  { label: 'Взяла', sort: 'taken', w: 'w-[80px]', right: true }, { label: '₽ 30 дн', sort: 'cost', w: 'w-[80px]', right: true }, { label: 'Флаги', w: 'w-[96px]' },
]

function PeopleTable({ list, o, tz, now, state }: { list: PersonRow[]; o: AdminOpts; tz: string; now: Date; state: { q: string; f: PeopleFilter; s: PeopleSort } }) {
  return (
    <Card className="hidden md:block overflow-x-auto">
      <table className="w-full table-fixed min-w-[1104px] text-[14px] border-collapse">
        <thead>
          <tr>
            {COLS.map((c, i) => (
              <th key={c.label} aria-sort={c.sort && state.s === c.sort ? 'descending' : undefined}
                className={`${c.w} px-3 py-2.5 text-[13px] font-medium ${c.right ? 'text-right' : 'text-left'} ${i === 0 ? 'sticky left-0 bg-brand-card pl-5' : ''} ${c.sort && state.s === c.sort ? 'text-brand-text' : 'text-brand-muted'}`}>
                {c.sort ? (
                  <Link href={href('/admin/people', o, { q: state.q, f: state.f === 'all' ? '' : state.f, s: c.sort === 'risk' ? '' : c.sort })} className="hover:text-brand-text underline-offset-4 hover:underline">
                    {c.label}{state.s === c.sort ? ' ↓' : ''}
                  </Link>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map(p => {
            const link = href(`/admin/people/${p.user_id}`, o)
            const counted = (p.churn.facts?.take_days?.length ?? 0) > 0 && p.churn.status !== 'gone'
            const cell = (children: React.ReactNode, cls = '') => (
              <td className={`p-0 border-t border-brand-border ${cls}`}>
                <Link href={link} tabIndex={-1} className="flex items-center h-14 px-3">{children}</Link>
              </td>
            )
            return (
              <tr key={p.user_id} className="group hover:bg-brand-soft-2" title={`пришла ${whenDay(p.registered_at, tz, now)}, ${srcRu(p.src)}`}>
                <td className="p-0 border-t border-brand-border sticky left-0 bg-brand-card group-hover:bg-brand-soft-2">
                  <Link href={link} className="flex flex-col justify-center h-14 pl-5 pr-3 min-w-0 focus-visible:outline-2 -outline-offset-2 outline-brand-accent">
                    <span className="truncate font-medium">{p.email}</span>
                    {p.full_name && <span className="truncate text-[13px] text-brand-muted">{p.full_name}</span>}
                  </Link>
                </td>
                {cell(<StatusBadge status={p.churn.status} />)}
                {cell(<RiskPill score={p.churn.score} level={p.churn.level} counted={counted} />)}
                {cell(<span className="truncate">{p.plan_name || 'нет'}</span>)}
                {cell(<span className="text-[13px] leading-tight line-clamp-2">{stepOf(p)}</span>)}
                {cell(whenDay(p.last_visit_at, tz, now))}
                {cell(<span className="ml-auto">{p.sessions_7}</span>)}
                {cell(<span className="ml-auto">{p.visit_days_30}</span>)}
                {cell(<span className="ml-auto whitespace-nowrap">{p.materials ? `${p.materials_taken} из ${p.materials}` : <span className="text-brand-muted">нет</span>}</span>)}
                {cell(<span className="ml-auto">{rub(p.cost_rub_30)}</span>)}
                {cell(<span className="flex flex-wrap gap-1">{flags(p)}</span>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
