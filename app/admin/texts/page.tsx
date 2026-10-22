// Вкладка «Тексты»: сигналы людей и шаблонность текстов по неделям (аналитика 2, SPEC B2). Данные из quality_weekly
// (их пишет scripts/quality-week.ts раз в неделю), самих текстов в кабинете нет. Фильтры живут в адресе: f, v, w.
import { adminTz, requireAdmin } from '@/lib/admin'
import { optsFrom } from '@/lib/analytics/admin-data'
import { loadQuality } from '@/lib/analytics/admin-a2'
import { ADMIN_TEXTS } from '@/lib/analytics/exit-copy'
import { textsParams } from '@/lib/analytics/texts-view'
import { PageHead } from '@/components/admin/ui'
import TextsView from '@/components/admin/TextsView'

type SP = Promise<Record<string, string | string[] | undefined>>

export default async function TextsPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin()
  const sp = await searchParams
  const o = optsFrom(sp)
  const tz = adminTz()
  const q = await loadQuality(o)
  return (
    <>
      <PageHead title={ADMIN_TEXTS.tab} sub={`По неделям, пн-вс по ${tz} · без служебных · самих текстов тут нет`} o={o} path="/admin/texts" />
      <TextsView rows={q.data} error={q.error} o={o} path="/admin/texts" params={textsParams(sp)} tz={tz} now={new Date()} />
    </>
  )
}
