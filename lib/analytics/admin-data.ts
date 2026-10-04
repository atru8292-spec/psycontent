// Данные кабинета /admin: только сервер, через service_role и SQL-функции миграции 20261005100000.
// Тяжелые подсчеты делает база, сюда приходят готовые цифры. В dev ?demo=1 отдает выдуманные данные (demo.ts),
// в проде демо выключено кодом. Служебные почты (INTERNAL_EMAILS) и тариф test не считаем, пока не включен
// переключатель «Показать служебных».

// только сервер: файл импортируют серверные компоненты и роуты /api/admin (service_role)
import { getSupabaseAdmin } from '@/lib/generation/db'
import { adminTz, internalEmails, adminOrNull } from '@/lib/admin'
import * as demo from './demo'
import type { AdminOpts, Period, PersonRow, Overview, FunnelStep, Onboarding, MakeStats, Features, Costs, PersonDetail } from './admin-types'

export type Loaded<T> = { data: T | null; error: null | 'no_migration' | 'failed' }

export const demoAllowed = () => process.env.NODE_ENV !== 'production'

export function optsFrom(sp: Record<string, string | string[] | undefined>): AdminOpts {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined
  const p = one('p')
  return {
    includeInternal: one('all') === '1',
    period: (p === '7' || p === '30' || p === 'all' ? p : '30') as Period,
    demo: demoAllowed() && one('demo') === '1',
  }
}

const base = (o: AdminOpts) => ({
  p_exclude_emails: o.includeInternal ? [] : internalEmails(),
  p_exclude_test: !o.includeInternal,
})
const range = (period: Period) => ({
  p_from: period === 'all' ? null : new Date(Date.now() - Number(period) * 86400000).toISOString(),
  p_to: null,
})

// Второй слой доступа: данные отдаются только админу, даже если страница забыла проверку
// (в Next 15 при мягкой навигации page рендерится без layout).
async function rpc<T>(fn: string, params: Record<string, unknown>): Promise<Loaded<T>> {
  if (!(await adminOrNull())) return { data: null, error: 'failed' }
  try {
    const { data, error } = await getSupabaseAdmin().rpc(fn, params)
    if (error) {
      // функции нет: миграция еще не применена
      const missing = error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01'
      if (!missing) console.warn('admin rpc', fn, error.code, error.message)
      return { data: null, error: missing ? 'no_migration' : 'failed' }
    }
    return { data: data as T, error: null }
  } catch (e) {
    console.warn('admin rpc', fn, (e as Error)?.message)
    return { data: null, error: 'failed' }
  }
}

// демо тоже только админу
const demoOk = async <T,>(make: () => T): Promise<Loaded<T>> => ((await adminOrNull()) ? { data: make(), error: null } : { data: null, error: 'failed' })

export const loadOverview = (o: AdminOpts) => (o.demo ? demoOk<Overview>(() => demo.demoOverview()) : rpc<Overview>('analytics_overview', { ...base(o), p_tz: adminTz() }))
export const loadPeople = (o: AdminOpts) => (o.demo ? demoOk<PersonRow[]>(() => demo.demoPeople()) : rpc<PersonRow[]>('analytics_people', { ...base(o), p_tz: adminTz() }))
export const loadFunnel = (o: AdminOpts) => (o.demo ? demoOk<FunnelStep[]>(() => demo.demoFunnel()) : rpc<FunnelStep[]>('analytics_funnel', { ...base(o), ...range(o.period), p_tz: adminTz() }))
export const loadOnboarding = (o: AdminOpts) => (o.demo ? demoOk<Onboarding>(() => demo.demoOnboarding()) : rpc<Onboarding>('analytics_onboarding', { ...base(o), ...range(o.period) }))
export const loadMake = (o: AdminOpts) => (o.demo ? demoOk<MakeStats>(() => demo.demoMake()) : rpc<MakeStats>('analytics_make', { ...base(o), ...range(o.period) }))
export const loadFeatures = (o: AdminOpts) => (o.demo ? demoOk<Features>(() => demo.demoFeatures()) : rpc<Features>('analytics_features', { ...base(o), p_tz: adminTz() }))
export const loadCosts = (o: AdminOpts) => (o.demo ? demoOk<Costs>(() => demo.demoCosts()) : rpc<Costs>('analytics_costs', { ...base(o), ...range(o.period), p_tz: adminTz() }))
export const loadPerson = (o: AdminOpts, id: string) =>
  (o.demo ? demoOk<PersonDetail | null>(() => demo.demoPerson(id)) : rpc<PersonDetail | null>('analytics_person', { p_user_id: id, p_tz: adminTz() }))

// Лендинг за 7 дней: уникальные session_id по land_view, land_cta_click, land_demo_submit.
// Прямой запрос к events (без SQL-функции и миграции). Служебных тут не отделить: на лендинге человек
// чаще всего еще без входа, поэтому переключатель «Показать служебных» на эти цифры не влияет.
export type LandingStats = { views: number; clicks: number; demo: number }
export async function loadLanding(o: AdminOpts): Promise<Loaded<LandingStats>> {
  if (!(await adminOrNull())) return { data: null, error: 'failed' }
  if (o.demo) return { data: { views: 214, clicks: 31, demo: 9 }, error: null }
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString()
    // PostgREST отдает не больше 1000 строк за раз, поэтому читаем страницами по id (до 50 000 событий)
    const data: { event: string; session_id: string | null }[] = []
    for (let page = 0; page < 50; page++) {
      const { data: part, error } = await getSupabaseAdmin().from('events').select('event, session_id')
        .in('event', ['land_view', 'land_cta_click', 'land_demo_submit']).gte('created_at', since)
        .order('id', { ascending: true }).range(page * 1000, page * 1000 + 999)
      if (error) {
        const missing = error.code === '42P01' || error.code === 'PGRST205'
        if (!missing) console.warn('admin landing', error.code, error.message)
        return { data: null, error: missing ? 'no_migration' : 'failed' }
      }
      data.push(...(part || []))
      if (!part || part.length < 1000) break
    }
    const uniq = (ev: string) => new Set((data || []).filter(r => r.event === ev && r.session_id).map(r => r.session_id)).size
    return { data: { views: uniq('land_view'), clicks: uniq('land_cta_click'), demo: uniq('land_demo_submit') }, error: null }
  } catch (e) {
    console.warn('admin landing', (e as Error)?.message)
    return { data: null, error: 'failed' }
  }
}
