// Воронки: онбординг по шагам (с «Кто ушел») и «Сделать» (форматы, режимы, ошибки).
import { requireAdmin } from '@/lib/admin'
import { optsFrom, loadOnboarding, loadMake, loadPeople } from '@/lib/analytics/admin-data'
import type { Onboarding, MakeStats, PersonRow, AdminOpts } from '@/lib/analytics/admin-types'
import { share, shareCol, plural } from '@/lib/analytics/definitions'
import { PERIOD_RU, formatRu, onbStepRu, errorRu } from '@/lib/analytics/admin-view'
import { MODE_RU } from '@/lib/analytics/events'
import { Card, Section, PageHead, LoadError, Table, Td, href, num, duration } from '@/components/admin/ui'

type SP = Promise<Record<string, string | string[] | undefined>>

export default async function FunnelsPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin()
  const o = optsFrom(await searchParams)
  const [on, mk, pe] = await Promise.all([loadOnboarding(o), loadMake(o), loadPeople(o)])
  const err = on.error || mk.error
  return (
    <>
      <PageHead title="Воронки" sub={`${PERIOD_RU[o.period][0].toUpperCase() + PERIOD_RU[o.period].slice(1)} · ${o.includeInternal ? 'со служебными' : 'без служебных'}`} o={o} path="/admin/funnels" period exportQuery={{ what: 'funnels' }} />
      {err || !on.data || !mk.data ? <LoadError kind={err === 'no_migration' ? 'no_migration' : 'failed'} /> : (
        <div className="space-y-8">
          <Onb d={on.data} people={pe.data || []} peopleFailed={!pe.data} o={o} />
          <Make d={mk.data} />
        </div>
      )}
    </>
  )
}

function Onb({ d, people, peopleFailed, o }: { d: Onboarding; people: PersonRow[]; peopleFailed: boolean; o: AdminOpts }) {
  const byId = new Map(people.map(p => [p.user_id, p]))
  // узкое место по доле ушедших с шага; при ничьей метку не ставим
  const drops = d.steps.map(s => (s.viewed ? s.dropped / s.viewed : 0))
  const maxDrop = Math.max(0, ...drops)
  const worst = maxDrop > 0 && drops.filter(x => x === maxDrop).length === 1 ? drops.indexOf(maxDrop) : -1
  const hasDrop = worst >= 0
  const maxViewed = Math.max(0, ...d.steps.map(s => s.viewed))
  return (
    <Section title="Онбординг по шагам" aside={`вход с Верой ${num(d.intro)} · прошли до конца ${share(d.finished, d.intro)}`}>
      <Card className="overflow-hidden">
        <div className="hidden lg:grid grid-cols-[1fr_100px_120px_120px_100px_150px] gap-4 px-5 py-2.5 text-[13px] text-brand-muted font-medium">
          <span>Шаг</span><span className="text-right">Увидели</span><span className="text-right">Прошли</span><span className="text-right">Медиана</span><span className="text-right">Ушли</span><span />
        </div>
        <div className="divide-y divide-brand-border border-t border-brand-border">
          {d.steps.map((s, i) => {
            const row = (<>
                <div className="hidden lg:grid grid-cols-[1fr_100px_120px_120px_100px_150px] gap-4 items-center">
                  <span className="flex items-center gap-2">{s.step}. {onbStepRu(s.step)}{hasDrop && i === worst && <span className="bg-brand-soft rounded px-1.5 text-[13px]">больше всего уходят тут</span>}</span>
                  <span className="text-right">{num(s.viewed)}</span>
                  <span className="text-right">{shareCol(s.done, s.viewed, maxViewed)}</span>
                  <span className="text-right">{duration(s.median_ms)}</span>
                  <span className="text-right font-semibold">{s.dropped}</span>
                  {s.dropped ? <span className="text-[13px] text-brand-muted group-hover:underline underline-offset-4 text-right">Кто ушел ({s.dropped})</span> : <span />}
                </div>
                <div className="lg:hidden space-y-1">
                  <div className="flex justify-between gap-3"><span className="font-medium">{s.step}. {onbStepRu(s.step)}</span><span>прошли {shareCol(s.done, s.viewed, maxViewed)}</span></div>
                  <div className="text-[13px] text-brand-muted">медиана {duration(s.median_ms)} · ушли {s.dropped}</div>
                  {hasDrop && i === worst && <span className="inline-block bg-brand-soft rounded px-1.5 text-[13px]">больше всего уходят тут</span>}
                  {s.dropped > 0 && <div className="min-h-11 flex items-center text-[13px] underline underline-offset-4">Кто ушел ({s.dropped})</div>}
                </div>
            </>)
            if (!s.dropped_users.length) return <div key={s.step} className="px-4 lg:px-5 py-3">{row}</div>
            return (
              <details key={s.step} name="onb" className="group">
                <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer px-4 lg:px-5 py-3 hover:bg-brand-soft-2 focus-visible:outline-2 -outline-offset-2 outline-brand-accent">{row}</summary>
                <div className="px-4 lg:px-5 pb-3">
                  <ul className="rounded-xl bg-brand-soft-2 divide-y divide-brand-border/70">
                    {s.dropped_users.slice(0, 20).map(u => (
                      <li key={u}><a href={href(`/admin/people/${u}`, o)} className="flex items-center px-3 min-h-11 hover:underline underline-offset-4 truncate">{byId.get(u)?.email || (peopleFailed ? 'почта не загрузилась, открой карточку' : 'служебный или скрытый аккаунт')}</a></li>
                    ))}
                  </ul>
                </div>
              </details>
            )
          })}
        </div>
      </Card>
    </Section>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 space-y-2">
      <div className="text-[13px] text-brand-muted">{label}</div>
      <div className="text-[28px] font-semibold leading-none">{value}</div>
    </Card>
  )
}

function Make({ d }: { d: MakeStats }) {
  const errUsers = d.errors_by_code.reduce((s, x) => s + x.n, 0)
  return (
    <Section title="Сделать">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <Mini label="Запусков" value={num(d.starts)} />
        <Mini label="Готово" value={share(d.done, d.starts)} />
        <Mini label="Взято" value={share(d.taken, d.materials)} />
        <Mini label="Медиана времени" value={duration(d.median_ms)} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="px-4 pt-4 font-semibold">По форматам</h3>
          <Table head={[{ label: 'Формат' }, { label: 'Запусков', right: true }, { label: 'Готово', right: true }, { label: 'Взято', right: true }]}>
            {d.by_format.map(f => (
              <tr key={f.format}><Td>{formatRu(f.format)}</Td><Td right>{f.started}</Td><Td right>{f.materials}</Td><Td right>{shareCol(f.taken, f.materials, Math.max(0, ...d.by_format.map(x => x.materials)))}</Td></tr>
            ))}
          </Table>
        </Card>
        <Card>
          <h3 className="px-4 pt-4 font-semibold">По режимам</h3>
          <Table head={[{ label: 'Режим' }, { label: 'Запусков', right: true }, { label: 'Доля', right: true }]}>
            {d.by_mode.map(m => (
              <tr key={m.mode}><Td><span className="first-letter:uppercase inline-block">{MODE_RU[m.mode] || m.mode}</span></Td><Td right>{m.n}</Td><Td right>{share(m.n, d.starts)}</Td></tr>
            ))}
          </Table>
        </Card>
      </div>
      <Card className="p-4 lg:p-5">
        <h3 className="font-semibold mb-2">Ошибки по кодам</h3>
        {!d.errors_by_code.length ? <p className="text-brand-muted">Ошибок нет</p> : (
          <ul className="space-y-1">
            {d.errors_by_code.map(e => <li key={e.code} className="flex justify-between gap-3"><span title={e.code}>{errorRu(e.code)}</span><span>{e.n} {plural(e.n, 'раз', 'раза', 'раз')}</span></li>)}
            <li className="text-[13px] text-brand-muted pt-1">всего {errUsers}</li>
          </ul>
        )}
      </Card>
    </Section>
  )
}
