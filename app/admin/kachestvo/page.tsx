// Вкладка «Качество текстов»: проверка кодом каждого текста zh13 за 7 дней (lib/analytics/kachestvo13.ts).
// Пороги тревоги те же, что у письма на ALERT_TO: начало подписи больше 15%, любая проблема больше 20%.
import { adminTz, requireAdmin } from '@/lib/admin'
import { optsFrom } from '@/lib/analytics/admin-data'
import { loadKachestvo13 } from '@/lib/analytics/kachestvo13'
import { PROBLEMY } from '@/lib/generation/zh13/proverka'
import { POMETKI } from '@/lib/generation/zh13/pometki'
import { CELI } from '@/lib/generation/zh13/formaty'
import { Card, Section, Note, PageHead, Table, Td, Bar, Flag, when, num } from '@/components/admin/ui'

type SP = Promise<Record<string, string | string[] | undefined>>
const pct = (x: number) => `${String(x).replace('.', ',')}%`
const DET: Record<string, string> = { vopros: PROBLEMY.vopros_konec, podpis: PROBLEMY.podpis_shablon, moral: PROBLEMY.moral, rod: PROBLEMY.rod, kopiya: PROBLEMY.kopiya,
  voprosy: 'Начала вопросов', povtorOborotov: 'Повторы оборотов', pometki: 'Пометки', perepis: 'Перепись фраз и подписи', perepisCelikom: 'Перепись целиком (адресат вопросов)' }
// детали бывают строкой, списком строк и списком пометок или переписей
function pokazat(v: any): string {
  const one = (x: any): string => typeof x === 'string' ? x
    : x && 'do' in x ? `«${x.do}» → ${x.posle ? `«${x.posle}»` : 'нет'}${x.vzyato ? '' : ` (не взято${x.pochemu ? `: ${x.pochemu}` : ''})`}`
    : x && 'fraza' in x ? `${POMETKI[x.kod] || x.kod}: «${x.fraza}»` : JSON.stringify(x)
  return Array.isArray(v) ? (v.length ? v.map(one).join(' · ') : 'нет') : one(v)
}

export default async function KachestvoPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin()
  const o = optsFrom(await searchParams)
  const tz = adminTz()
  const q = await loadKachestvo13()
  const d = q.data
  return (
    <>
      <PageHead title="Качество текстов" sub="Генератор zh13 · последние 7 дней · проверка кодом, без модели · все аккаунты, включая служебные" o={o} path="/admin/kachestvo" />
      {q.error === 'no_migration' && <Note>Таблицы проверки еще нет в базе. Цифры появятся, когда применишь миграцию 20261119120000_zh13_kachestvo.sql.</Note>}
      {q.error === 'failed' && <Note>Не получилось собрать цифры. Обнови страницу через минуту.</Note>}
      {d && d.vsego === 0 && <Note>За неделю текстов zh13 еще не было.</Note>}
      {d && d.vsego > 0 && (
        <div className="space-y-8 pb-12">
          {d.trevoga.length > 0 && (
            <Card className="p-4 border-brand-accent">
              <p className="font-semibold">Выше порога, письмо на ALERT_TO уходит раз в день</p>
              <ul className="mt-2 space-y-1 text-[14px]">{d.trevoga.map(t => <li key={t}>{t}</li>)}</ul>
            </Card>
          )}

          <Section title="Проблемы по форматам" aside={`${num(d.vsego)} текстов`}>
            <Card>
              <Table minW={560} head={[{ label: 'Проблема' }, ...d.poVidam.map(v => ({ label: `${v.imya} (${v.n})`, right: true })), { label: 'Всего', right: true }]}>
                {d.problemyVse.map(p => (
                  <tr key={p.kod}>
                    <Td>{p.imya}</Td>
                    {d.poVidam.map(v => {
                      const x = v.problemy[p.kod] || 0
                      return <Td key={v.vid} right className="tabular-nums">{v.n ? (x > 20 ? <Flag>{pct(x)}</Flag> : pct(x)) : '·'}</Td>
                    })}
                    <Td right className="tabular-nums">{p.dolya > 20 ? <Flag>{pct(p.dolya)}</Flag> : pct(p.dolya)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td className="text-brand-muted">Ритм: отклонение от живых (меньше ближе)</Td>
                  {d.poVidam.map(v => <Td key={v.vid} right className="tabular-nums text-brand-muted">{v.blizost === null ? '·' : String(v.blizost).replace('.', ',')}</Td>)}
                  <Td> </Td>
                </tr>
              </Table>
            </Card>
          </Section>

          <div className="grid gap-8 lg:grid-cols-2">
            {([['Начала подписей, топ-10', d.podpisi], ['Первые слова текста, топ-10', d.nachala]] as const).map(([t, rows]) => (
              <Section key={t} title={t}>
                <Card className="p-4 space-y-2.5">
                  {rows.length === 0 && <p className="text-[14px] text-brand-muted">Пока нет</p>}
                  {rows.map(r => (
                    <div key={r.s} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center text-[14px]">
                      <span className="min-w-0 truncate">«{r.s}»</span>
                      <span className="tabular-nums text-brand-muted">{r.n} · {r.dolya > 15 ? <Flag>{pct(r.dolya)}</Flag> : pct(r.dolya)}</span>
                      <div className="col-span-2"><Bar value={r.n} max={rows[0].n} /></div>
                    </div>
                  ))}
                </Card>
              </Section>
            ))}
          </div>

          <Section title="Смесь в блоге по психологам" aside="норма на 5 текстов: 2 узнавание, 1 польза, 1 спор, 1 доверие">
            <div className="space-y-3">
              {d.smes.map(x => (
                <Card key={x.kto} className="p-4 space-y-2 text-[14px]">
                  <div className="flex flex-wrap items-baseline gap-x-3"><span className="font-semibold">{x.kto}</span><span className="text-brand-muted">{x.n} текстов за неделю</span></div>
                  <p>Цели: {Object.entries(x.celi).map(([c, k]) => `${CELI[c as keyof typeof CELI]} ${k}`).join(' · ')}</p>
                  <p className="[overflow-wrap:anywhere]">Хуки: {x.huki.map(([h, k]) => `${h} ${k}`).join(' · ')}</p>
                  <p className="[overflow-wrap:anywhere]">Форматы: {x.formaty.map(([h, k]) => `${h} ${k}`).join(' · ')}</p>
                  {x.perekos.length > 0 && <div className="flex flex-wrap gap-1.5">{x.perekos.map(p => <Flag key={p}>Перекос: {p}</Flag>)}</div>}
                </Card>
              ))}
            </div>
          </Section>

          <Section title="Пометки и перепись фраз">
            <Card>
              <Table minW={480} head={[{ label: 'Пометка' }, { label: 'Нашлось', right: true }, { label: 'Переписано', right: true }, { label: 'Оставлено как было', right: true }]}>
                {d.pometki.map(p => (
                  <tr key={p.kod}><Td>{p.imya}</Td><Td right className="tabular-nums">{p.n}</Td><Td right className="tabular-nums">{p.vzyato}</Td><Td right className="tabular-nums">{p.nePerepisano}</Td></tr>
                ))}
              </Table>
            </Card>
          </Section>

          <Section title="Форматы: сколько пишут и сколько переделывают">
            <Card>
              <Table minW={560} head={[{ label: 'Формат' }, { label: 'Текстов', right: true }, { label: 'Заново', right: true }, { label: 'Другой формат', right: true }, { label: 'Скопировали', right: true }, { label: 'Переделывают', right: true }]}>
                {d.formaty.map(f => (
                  <tr key={f.kod}>
                    <Td>{f.imya}</Td>
                    <Td right className="tabular-nums">{f.n}</Td>
                    <Td right className="tabular-nums">{f.zanovo}</Td>
                    <Td right className="tabular-nums">{f.drugoy}</Td>
                    <Td right className="tabular-nums">{f.kopiya}</Td>
                    <Td right className="tabular-nums">{pct(f.dolyaPeredelki)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </Section>

          <Section title="Последние тексты с проблемами">
            <div className="space-y-4">
              {d.poslednie.length === 0 && <p className="text-[14px] text-brand-muted">Текстов с проблемами нет</p>}
              {d.poslednie.map(x => (
                <Card key={x.postId} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold">{x.imya}</span>
                    <span className="text-[13px] text-brand-muted">{when(x.created_at, tz)}{x.mysl ? ' · своя мысль' : ''}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{x.problemy.map(p => <Flag key={p}>{PROBLEMY[p] || p}</Flag>)}</div>
                  <pre className="whitespace-pre-wrap font-sans text-[14px] leading-6 bg-brand-soft-2 rounded-xl p-3 [overflow-wrap:anywhere]">{x.content}</pre>
                  {Object.keys(x.detali || {}).length > 0 && (
                    <div className="text-[13px] text-brand-muted space-y-0.5">
                      {Object.entries(x.detali).map(([k, v]) => <p key={k} className="[overflow-wrap:anywhere]">{DET[k] || PROBLEMY[k] || k}: {pokazat(v)}</p>)}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </Section>
        </div>
      )}
    </>
  )
}
