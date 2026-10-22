// Предпросмотр аналитики 2 без входа, для снимков Playwright: карточка опроса в четырех состояниях, блок «Почему
// уходят» и секция человека на демо-данных, вкладка «Тексты» на demoQuality. В базу страница не ходит (демо из кода),
// POST /api/exit-survey и /api/ev на снимках перехватываются. На проде 404, если не включен PREVIEW_PAGES=1.
// ?s=survey-collapsed | survey-open | survey-thanks | survey-pause | stuck-collapsed | stuck-open | stuck-thanks | exits | texts (для texts еще f, v, w)
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { demoExitStats, demoQuality, type PersonExit } from '@/lib/analytics/admin-a2'
import type { AdminOpts } from '@/lib/analytics/admin-types'
import { textsParams } from '@/lib/analytics/texts-view'
import { ExitSummary, PersonExitSection } from '@/components/admin/ExitBlocks'
import TextsView from '@/components/admin/TextsView'
import SurveyDemo from './SurveyDemo'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const SURVEY = { 'survey-collapsed': 'collapsed', 'survey-open': 'open', 'survey-thanks': 'thanks', 'survey-pause': 'pause' } as const
const STUCK = { 'stuck-collapsed': 'collapsed', 'stuck-open': 'open', 'stuck-thanks': 'thanks' } as const
const TZ = 'Asia/Barnaul'

export default async function AnalitikaPreview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === 'production' && process.env.PREVIEW_PAGES !== '1') notFound()
  const sp = await searchParams
  const s = (Array.isArray(sp.s) ? sp.s[0] : sp.s) || 'survey-collapsed'
  if (s in SURVEY) return <SurveyDemo view={SURVEY[s as keyof typeof SURVEY]} />
  if (s in STUCK) return <SurveyDemo place="stuck" view={STUCK[s as keyof typeof STUCK]} />

  const o: AdminOpts = { includeInternal: false, period: '30', demo: true }
  const now = new Date()
  const body = (() => {
    if (s === 'exits') {
      const d = demoExitStats()
      const first = d.answers[0]
      const answered: PersonExit = { answers: d.answers.filter(a => a.user_id === first.user_id), shownAt: first.created_at, dismissedAt: null }
      const closed: PersonExit = { answers: [], shownAt: new Date(now.getTime() - 10 * 86400000).toISOString(), dismissedAt: new Date(now.getTime() - 10 * 86400000).toISOString() }
      return (
        <div className="space-y-10 mt-6">
          <ExitSummary d={d} error={null} o={o} tz={TZ} now={now} />
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div className="hidden lg:block" />
            <div className="space-y-4">
              <PersonExitSection d={answered} tz={TZ} now={now} />
              <PersonExitSection d={closed} tz={TZ} now={now} />
            </div>
          </div>
        </div>
      )
    }
    if (s === 'texts') {
      return (
        <>
          <div className="mt-6 mb-6">
            <h1 className="text-2xl font-semibold">Тексты</h1>
            <p className="text-[13px] text-brand-muted mt-1">По неделям, пн-вс по {TZ} · без служебных · самих текстов тут нет</p>
          </div>
          <TextsView rows={demoQuality(now, TZ)} error={null} o={o} path="/preview/analitika" keep={{ s: 'texts' }} params={textsParams(sp)} tz={TZ} now={now} />
        </>
      )
    }
    return null
  })()
  if (!body) notFound()
  return (
    <div className="min-h-dvh bg-brand-bg text-brand-text text-[14px] tabular-nums">
      <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 pb-16">{body}</main>
    </div>
  )
}
