// Деньги: траты на ИИ по дням (SVG без библиотек), средние, операции и модели, кто тратит больше,
// дороже своего тарифа, экономика и маржа, откуда пришли.
import { requireAdmin } from '@/lib/admin'
import { optsFrom, loadCosts } from '@/lib/analytics/admin-data'
import type { Costs, AdminOpts } from '@/lib/analytics/admin-types'
import { shareCol, fmtNum, RATIO_GOAL, RATIO_WARN, COST_OVER_PLAN_SHARE } from '@/lib/analytics/definitions'
import { economyRows } from '@/lib/analytics/export'
import { PERIOD_RU, opRu, srcRu } from '@/lib/analytics/admin-view'
import { USD_TO_RUB_DRAFT } from '@/lib/energy'
import { Card, Section, PageHead, LoadError, Table, Td, AttentionMark, href, rub, num } from '@/components/admin/ui'

type SP = Promise<Record<string, string | string[] | undefined>>
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const dayRu = (ymd: string) => { const [, m, d] = ymd.split('-').map(Number); return `${d} ${MONTHS[m - 1]}` }

export default async function CostsPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin()
  const o = optsFrom(await searchParams)
  const r = await loadCosts(o)
  return (
    <>
      <PageHead title="Деньги" sub={`${PERIOD_RU[o.period][0].toUpperCase() + PERIOD_RU[o.period].slice(1)} · ${o.includeInternal ? 'со служебными' : 'без служебных'}`} o={o} path="/admin/costs" period exportQuery={{ what: 'costs' }} />
      {r.error || !r.data ? <LoadError kind={r.error === 'no_migration' ? 'no_migration' : 'failed'} /> : <Body c={r.data} o={o} />}
    </>
  )
}

function Chart({ days, all }: { days: Costs['by_day']; all: boolean }) {
  const list = days.slice(-30)
  const max = Math.max(1, ...list.map(d => d.rub))
  const n = Math.max(1, list.length)
  const mid = list[Math.floor((list.length - 1) / 2)]
  return (
    <Card className="p-4 lg:p-5">
      {!list.length || list.every(d => !d.rub) ? <p className="text-brand-muted">Трат за этот период нет</p> : (
        <>
          <div className="flex justify-between text-[13px] text-brand-muted mb-2"><span>максимум за день {rub(max)}</span>{all && <span>последние 30 дней</span>}</div>
          <div className="relative h-[140px] lg:h-[180px]">
            <svg viewBox={`0 0 ${n * 10} 100`} preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="Траты на ИИ по дням">
              {[25, 50, 75].map(y => <line key={y} x1="0" x2={n * 10} y1={y} y2={y} className="stroke-brand-border" vectorEffect="non-scaling-stroke" />)}
              {list.map((d, i) => {
                const h = d.rub > 0 ? Math.max(1.5, (d.rub / max) * 100) : 0.8
                return (
                  <rect key={d.day} x={i * 10 + 1.5} width="7" y={100 - h} height={h} rx="1"
                    className={d.rub > 0 ? (i === list.length - 1 ? 'fill-brand-accent/60' : 'fill-brand-accent') : 'fill-brand-border'}>
                    <title>{`${dayRu(d.day)} · ${rub(d.rub)}`}</title>
                  </rect>
                )
              })}
            </svg>
          </div>
          <div className="flex justify-between text-[13px] text-brand-muted mt-2">
            <span>{dayRu(list[0].day)}</span>{list.length > 2 && <span>{dayRu(mid.day)}</span>}<span>{dayRu(list[list.length - 1].day)}</span>
          </div>
          <p className="text-[13px] text-brand-muted mt-1">Бледный столбец это сегодня, день еще идет</p>
        </>
      )}
    </Card>
  )
}

function Tile({ label, value, foot, warn = false }: { label: string; value: React.ReactNode; foot?: React.ReactNode; warn?: boolean }) {
  return (
    <Card className="p-4 lg:p-5 space-y-2">
      <div className="text-[13px] text-brand-muted">{label}</div>
      <div className="text-[28px] font-semibold leading-none">{warn ? <AttentionMark>{value}</AttentionMark> : value}</div>
      {foot && <div className="text-[13px] text-brand-muted">{foot}</div>}
    </Card>
  )
}

function Body({ c, o }: { c: Costs; o: AdminOpts }) {
  const eco = economyRows(c)
  const e = c.economy
  return (
    <div className="space-y-8">
      <Section title="Траты по дням" aside={`всего ${rub(c.total_rub)}`}><Chart days={c.by_day} all={o.period === 'all'} /></Section>
      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <Tile label="ИИ на готовый материал" value={c.materials ? rub(c.total_rub / c.materials) : 'нет'} foot={`материалов ${num(c.materials)}`} />
        <Tile label="ИИ на взятый текст" value={c.taken ? rub(c.total_rub / c.taken) : 'нет'} foot={`взято ${num(c.taken)}`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-6">
        <Section title="По операциям">
          <Card>
            <Table head={[{ label: 'Операция' }, { label: 'Вызовов', right: true }, { label: 'Траты', right: true }]}>
              {c.by_operation.map(x => <tr key={x.operation}><Td><span title={x.operation}>{opRu(x.operation)}</span></Td><Td right>{num(x.calls)}</Td><Td right>{rub(x.rub)}</Td></tr>)}
            </Table>
            {!c.by_operation.length && <p className="px-4 pb-4 text-brand-muted">Трат за этот период нет</p>}
          </Card>
        </Section>
        <Section title="По моделям">
          <Card>
            <Table head={[{ label: 'Модель' }, { label: 'Вызовов', right: true }, { label: 'Траты', right: true }]}>
              {c.by_model.map(x => <tr key={x.model}><Td>{x.model}</Td><Td right>{num(x.calls)}</Td><Td right>{rub(x.rub)}</Td></tr>)}
            </Table>
            {!c.by_model.length && <p className="px-4 pb-4 text-brand-muted">Трат за этот период нет</p>}
          </Card>
        </Section>
      </div>
      <Section title="Кто тратит больше всех">
        <Card className="overflow-hidden">
          {!c.top_users.length ? <p className="p-4 text-brand-muted">Трат за этот период нет</p> : (
            <ul className="divide-y divide-brand-border">
              {c.top_users.slice(0, 10).map(u => (
                <li key={u.user_id}><a href={href(`/admin/people/${u.user_id}`, o)} className="flex justify-between gap-3 px-4 min-h-11 items-center hover:bg-brand-soft-2"><span className="truncate">{u.email}</span><span className="shrink-0">{rub(u.rub)}</span></a></li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
      <Section title="Дороже своего тарифа" aside={`ИИ за 30 дней больше ${Math.round(COST_OVER_PLAN_SHARE * 100)}% цены`}>
        <Card className="overflow-hidden">
          {!c.over_plan.length ? <p className="p-4 text-brand-muted">Все укладываются в {Math.round(COST_OVER_PLAN_SHARE * 100)}% цены тарифа</p> : (
            <ul className="divide-y divide-brand-border">
              {c.over_plan.map(u => (
                <li key={u.user_id}><a href={href(`/admin/people/${u.user_id}`, o)} className="flex flex-wrap justify-between gap-x-3 gap-y-1 px-4 py-2 min-h-11 items-center hover:bg-brand-soft-2">
                  <span className="truncate">{u.email}</span>
                  <span className="flex items-center gap-2"><AttentionMark>внимание</AttentionMark>{rub(u.rub_30)} из {rub(u.plan_price)}</span>
                </a></li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
      <Section title="Экономика">
        {!e.paying ? <p className="text-brand-muted">Платящих пока нет, тариф пока включается вручную</p> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
              <Tile label="Платящих" value={num(e.paying)} />
              <Tile label="Выручка в месяц (MRR)" value={rub(e.mrr)} />
              <Tile label="Средний чек" value={rub(eco.avgCheck)} />
              <Tile label="Отток платящих за 30 дней" value={num(e.churned_paying_30)} />
              <Tile label="ИИ на платящего" value={rub(eco.aiPerPaying)} foot="за 30 дней" />
              <Tile label="Выручка к тратам на ИИ" value={eco.ratio === null ? 'нет трат' : `${fmtNum(Math.round(eco.ratio * 10) / 10)} к 1`} foot={`цель ${RATIO_GOAL} к 1`} warn={eco.ratio !== null && eco.ratio < RATIO_WARN} />
            </div>
            <Card>
              <h3 className="px-4 pt-4 font-semibold">Маржа по тарифам</h3>
              <p className="px-4 text-[13px] text-brand-muted">после ИИ, комиссии и налога</p>
              <div className="hidden sm:block">
                <Table head={[{ label: 'Тариф' }, { label: 'Цена', right: true }, { label: 'Людей', right: true }, { label: 'ИИ на человека', right: true }, { label: 'Маржа', right: true }]}>
                  {eco.plans.map(p => <tr key={p.code}><Td>{p.name}</Td><Td right>{rub(p.price)}</Td><Td right>{p.users}</Td><Td right>{rub(p.perUser)}</Td><Td right>{p.margin === null ? 'нет' : rub(p.margin)}</Td></tr>)}
                </Table>
              </div>
              <ul className="sm:hidden mt-3 divide-y divide-brand-border border-t border-brand-border">
                {eco.plans.map(p => (
                  <li key={p.code} className="px-4 py-3 space-y-1">
                    <div className="flex justify-between gap-3"><span className="font-medium">{p.name}, {rub(p.price)}</span><span>маржа {p.margin === null ? 'нет' : rub(p.margin)}</span></div>
                    <div className="text-[13px] text-brand-muted">людей {p.users} · ИИ на человека {rub(p.perUser)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </Section>
      <Section title="Откуда пришли">
        <Card>
          <Table head={[{ label: 'Источник' }, { label: 'Пришло', right: true }, { label: 'Активировались', right: true }, { label: 'Платят', right: true }]}>
            {c.sources.map(s => <tr key={s.src}><Td>{srcRu(s.src)}</Td><Td right>{s.users}</Td><Td right>{shareCol(s.activated, s.users, Math.max(0, ...c.sources.map(x => x.users)))}</Td><Td right>{s.paying}</Td></tr>)}
          </Table>
          {!c.sources.length && <p className="px-4 pb-4 text-brand-muted">Источников пока нет</p>}
        </Card>
      </Section>
      <p className="text-[13px] text-brand-muted">Курс доллара черновой ({USD_TO_RUB_DRAFT} ₽), цифры приблизительные.</p>
    </div>
  )
}
