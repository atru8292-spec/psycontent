// zh14: пометки правок Арины 19.11 (1-7) на сохраненных текстах прогона, без модели. Печатает, что нашлось в каждом
// тексте, и пишет JSON для отчета.
//   npx tsx scripts/zh14-pometki.ts <rezultaty.json> [выход.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { formatPo } from '../lib/generation/zh13/formaty'
import { pometit, pometitObrashcheniya } from '../lib/generation/zh13/pometki'
import { moralKonca, podpisPerevertysh, povtorSoveta } from '../lib/generation/zh13/proverka'
import { SCENY, svestiRepliki } from '../lib/generation/zh13/sceny'

const R = JSON.parse(readFileSync(process.argv[2], 'utf-8')).filter((x: any) => x.meta)
const out: any[] = []
let proshlyy = ''
for (const x of R) {
  const f = formatPo(x.meta.kod)!
  const glavnoe = x.glavnoe, podpis = x.podpis || ''
  const p: { kod: string; fraza: string }[] = [
    ...pometitObrashcheniya(glavnoe, podpis, proshlyy),
    ...pometit(glavnoe, f.kod, x.meta.nadpis || '').filter(y => ['telo', 'rvano', 'obryvki'].includes(y.kod)),
  ]
  const mk = moralKonca(f, x.tekst || glavnoe, glavnoe, x.meta.mysl)
  if (mk) p.push({ kod: 'moral_konec', fraza: mk })
  if (podpis && podpisPerevertysh(podpis)) p.push({ kod: 'perevertysh', fraza: podpis })
  const ps = proshlyy ? povtorSoveta(`${glavnoe}\n${podpis}`, proshlyy) : []
  for (const s of ps) p.push({ kod: 'povtor_soveta', fraza: s })
  const sc = x.meta.scena ? SCENY.find(s => s.id === x.meta.scena) : null
  const sv = sc ? svestiRepliki(glavnoe, sc) : null
  if (sv && sv.ispravleno.length) for (const i of sv.ispravleno) p.push({ kod: 'scena_repliki', fraza: `${i.bylo} → ${i.stalo.join(' / ') || 'убрано'}` })
  console.log(`== ${x.key}`)
  for (const y of p) console.log(`   ${y.kod}: ${y.fraza}`)
  out.push({ key: x.key, imya: x.imya, pometki: p })
  proshlyy = `${glavnoe}\n${podpis}`
}
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(out, null, 1))
