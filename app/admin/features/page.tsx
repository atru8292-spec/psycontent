// Функции: форматы, функции, экраны, стили каруселей и то, что за 30 дней никто не открывал.
import { requireAdmin } from '@/lib/admin'
import { optsFrom, loadFeatures } from '@/lib/analytics/admin-data'
import type { Features } from '@/lib/analytics/admin-types'
import { shareCol } from '@/lib/analytics/definitions'
import { FEATURE_RU, SCREEN_RU, formatRu, styleRu } from '@/lib/analytics/admin-view'
import { Card, Section, PageHead, LoadError, Table, Td, Bar } from '@/components/admin/ui'

type SP = Promise<Record<string, string | string[] | undefined>>

export default async function FeaturesPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin()
  const o = optsFrom(await searchParams)
  const r = await loadFeatures(o)
  return (
    <>
      <PageHead title="Функции" sub={`Срок указан у каждой таблицы · ${o.includeInternal ? 'со служебными' : 'без служебных'}`} o={o} path="/admin/features" exportQuery={{ what: 'features' }} />
      {r.error || !r.data ? <LoadError kind={r.error === 'no_migration' ? 'no_migration' : 'failed'} /> : <Body d={r.data} />}
    </>
  )
}

const USERS_HEAD = [{ label: 'Название' }, { label: 'Люди, 7 дн', right: true }, { label: 'Люди, 30 дн', right: true }, { label: 'Раз', right: true }]

function Body({ d }: { d: Features }) {
  const unused = [
    ...d.features.filter(f => f.users_30 === 0).map(f => FEATURE_RU[f.feature] || f.feature),
    ...d.screens.filter(s => s.users_30 === 0).map(s => SCREEN_RU[s.screen] || s.screen),
  ]
  const feats = [...d.features].filter(f => f.users_30 > 0).sort((a, b) => b.users_30 - a.users_30 || b.times_30 - a.times_30)
  const screens = [...d.screens].filter(s => s.users_30 > 0).sort((a, b) => b.users_30 - a.users_30 || b.times_30 - a.times_30)
  const styles = [...d.carousel_styles].sort((a, b) => b.exports - a.exports)
  const maxStyle = Math.max(1, ...styles.map(s => s.exports))
  return (
    <div className="space-y-8">
      <Section title="Форматы" aside="за 30 дней">
        <Card>
          <Table head={[{ label: 'Формат' }, { label: 'Людей', right: true }, { label: 'Сделано', right: true }, { label: 'Взято', right: true }]}>
            {d.formats.map(f => <tr key={f.format}><Td>{formatRu(f.format)}</Td><Td right>{f.users_30}</Td><Td right>{f.made_30}</Td><Td right>{shareCol(f.taken_30, f.made_30, Math.max(0, ...d.formats.map(x => x.made_30)))}</Td></tr>)}
          </Table>
          {!d.formats.length && <p className="px-4 pb-4 text-brand-muted">Материалов за 30 дней нет</p>}
        </Card>
      </Section>
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-6">
        <Section title="Функции" aside="раз за 30 дней">
          <Card>
            <Table head={USERS_HEAD}>
              {feats.map(f => <tr key={f.feature}><Td>{FEATURE_RU[f.feature] || f.feature}</Td><Td right>{f.users_7}</Td><Td right>{f.users_30}</Td><Td right>{f.times_30}</Td></tr>)}
            </Table>
            {!feats.length && <p className="px-4 pb-4 text-brand-muted">Функции за 30 дней не открывали</p>}
          </Card>
        </Section>
        <Section title="Экраны" aside="раз за 30 дней">
          <Card>
            <Table head={USERS_HEAD}>
              {screens.map(s => <tr key={s.screen}><Td>{SCREEN_RU[s.screen] || s.screen}</Td><Td right>{s.users_7}</Td><Td right>{s.users_30}</Td><Td right>{s.times_30}</Td></tr>)}
            </Table>
            {!screens.length && <p className="px-4 pb-4 text-brand-muted">Просмотров экранов пока нет</p>}
          </Card>
        </Section>
      </div>
      <Section title="Стили каруселей" aside="по сохранениям">
        <Card className="p-4 lg:p-5">
          {!styles.length ? <p className="text-brand-muted">Карусели пока не сохраняли</p> : (
            <ul className="space-y-3">
              {styles.map(s => (
                <li key={s.style} className="space-y-1">
                  <div className="flex justify-between gap-3"><span>{styleRu(s.style)}</span><span className="text-[13px] text-brand-muted">{s.exports} · каруселей {s.carousels}</span></div>
                  <Bar value={s.exports} max={maxStyle} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
      <Section title="За 30 дней никто не открывал">
        <p className="text-brand-muted">{unused.length ? unused.join(', ') : 'За 30 дней хоть раз открывали все'}</p>
      </Section>
    </div>
  )
}
