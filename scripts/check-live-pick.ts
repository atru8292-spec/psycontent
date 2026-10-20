// Как часто подбор живых примеров (pickLiveExamples, pickLiveCarousels) берет одного автора: по 48 материалов
// на каждый голос тестовых психологов и формат. Бесплатно, без модели.
//   npx tsx scripts/check-live-pick.ts
import { pickLiveExamples } from '../lib/generation/hypotheses'
import type { FormatCode } from '../lib/generation/text-guard'

const VOICES = { 'Юлия (спокойно)': { allowMat: false, hot: false, calm: false }, 'Ольга (мат, горячо)': { allowMat: true, hot: true, calm: false }, 'Михаил (без мата)': { allowMat: false, hot: false, calm: false } }
const FORMATS: FormatCode[] = ['reels_monolog', 'reels_otvet', 'reels_spisok', 'reels_scenka', 'reels_rol', 'post', 'carousel']
const authorOf = (t: { id: string; author?: string }) => t.author || (t.id.includes('#') ? t.id.split('#')[0] : t.id)
for (const [name, v] of Object.entries(VOICES)) {
  for (const f of FORMATS) {
    const n = new Map<string, number>()
    for (let r = 0; r < 48; r++) for (const t of pickLiveExamples(f, { ...v, rotation: r })) n.set(authorOf(t), (n.get(authorOf(t)) || 0) + 1)
    const top = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, k]) => `${a} ${Math.round((k / 48) * 100)}%`).join(', ')
    console.log(`${name} ${f}: авторов ${n.size}, чаще всех ${top}`)
  }
}
