// Выгрузка кабинета /admin: CSV экрана («Скачать таблицу») или ZIP со всеми таблицами («Выгрузить все»).
// Только для ADMIN_EMAILS, чужим 404. Файлы содержат почты и имена: это персональные данные, их не пересылать и не класть в git.
// Параметры те же, что у экранов: p (7|30|all), all=1 (служебные), demo=1 (только dev), q, f, s (люди), id (человек).

import { adminOrNull, adminTz, notFoundResponse } from '@/lib/admin'
import { optsFrom, loadOverview, loadPeople, loadFunnel, loadOnboarding, loadMake, loadFeatures, loadCosts, loadPerson } from '@/lib/analytics/admin-data'
import { filterPeople, isFilter, isSort } from '@/lib/analytics/admin-view'
import { toCsv, toCsvSections, overviewTable, funnelTable, onboardingTable, peopleTable, makeTables, featuresTables, costsTables, personTables, type Table } from '@/lib/analytics/export'
import { makeZip } from '@/lib/carousel/zip'

export const dynamic = 'force-dynamic'

const WHAT = ['overview', 'people', 'funnels', 'features', 'costs', 'person', 'all'] as const
type What = typeof WHAT[number]

const uuid = /^[0-9a-f-]{36}$/i

export async function GET(req: Request) {
  const admin = await adminOrNull()
  if (!admin) return notFoundResponse()

  const url = new URL(req.url)
  const sp = Object.fromEntries(url.searchParams)
  const what = (WHAT as readonly string[]).includes(sp.what) ? (sp.what as What) : null
  if (!what) return notFoundResponse()
  const o = optsFrom(sp)
  const tz = adminTz()
  const now = new Date()

  const people = async () => {
    const r = await loadPeople(o)
    return r.data ? peopleTable(filterPeople(r.data, sp.q || '', isFilter(sp.f) ? sp.f : 'all', isSort(sp.s) ? sp.s : 'risk'), tz, now) : null
  }
  const build: Record<Exclude<What, 'all' | 'person'>, () => Promise<Table[] | null>> = {
    overview: async () => {
      const [ov, fu] = await Promise.all([loadOverview(o), loadFunnel(o)])
      return ov.data && fu.data ? [overviewTable(ov.data), funnelTable(fu.data)] : null
    },
    people: async () => { const t = await people(); return t ? [t] : null },
    funnels: async () => {
      const [on, mk] = await Promise.all([loadOnboarding(o), loadMake(o)])
      return on.data && mk.data ? [onboardingTable(on.data), ...makeTables(mk.data)] : null
    },
    features: async () => { const r = await loadFeatures(o); return r.data ? featuresTables(r.data) : null },
    costs: async () => { const r = await loadCosts(o); return r.data ? costsTables(r.data) : null },
  }

  const stamp = now.toISOString().slice(0, 10)
  const prefix = o.demo ? 'demo_psycont' : 'psycont'
  const headers = (type: string, name: string) => ({
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  })
  const fail = () => new Response('Таблица не собралась, попробуй еще раз', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

  let tables: Table[] | null
  if (what === 'all') {
    const parts = await Promise.all((Object.keys(build) as (keyof typeof build)[]).filter(k => k !== 'people').map(k => build[k]()))
    const ppl = await people()
    if (parts.some(p => !p) || !ppl) return fail()
    tables = [...parts.flatMap(p => p!), ppl]
    const enc = new TextEncoder()
    const zip = makeZip(tables.map((t, i) => ({ name: `${String(i + 1).padStart(2, '0')}_${t.name}.csv`, data: enc.encode(toCsv(t)) })))
    console.info('admin export', { by: admin.id, what, period: o.period, internal: o.includeInternal, demo: o.demo, tables: tables.length })
    return new Response(zip as unknown as BodyInit, { headers: headers('application/zip', `${prefix}_${stamp}.zip`) })
  }

  if (what === 'person') {
    if (!uuid.test(sp.id || '')) return notFoundResponse()
    const r = await loadPerson(o, sp.id)
    if (r.error) return fail()
    if (!r.data) return notFoundResponse()
    tables = personTables(r.data, tz, now)
  } else {
    tables = await build[what]()
    if (!tables) return fail()
  }

  console.info('admin export', { by: admin.id, what, period: o.period, internal: o.includeInternal, demo: o.demo, rows: tables.reduce((s, t) => s + t.rows.length, 0) })
  return new Response(toCsvSections(tables), { headers: headers('text/csv; charset=utf-8', `${prefix}_${what}_${stamp}.csv`) })
}
