// Кабинет /admin/kachestvo: качество текстов zh13 за 7 дней из zh13_kachestvo (пишет lib/generation/zh13/kachestvo-db.ts).
// Доли проблем по форматам, топ-10 начал подписей и первых фраз, частые форматы, какие форматы чаще переделывают,
// 5 последних текстов с проблемами целиком (просьба Арины 19.11: тексты только тут, в выгрузки не идут).
// Служебных не исключаем: это качество генератора, а не поведение людей, а zh13 сначала включен только тестовым почтам.
import { getSupabaseAdmin } from '@/lib/generation/db'
import { errTag } from '@/lib/safe-error'
import { FORMATY, formatPo } from '@/lib/generation/zh13/formaty'
import { PROBLEMY } from '@/lib/generation/zh13/proverka'
import { vysheePoroga } from '@/lib/generation/zh13/kachestvo-db'
import { POMETKI } from '@/lib/generation/zh13/pometki'

export type Kachestvo13 = {
  vsego: number
  poVidam: { vid: string; imya: string; n: number; problemy: Record<string, number>; blizost: number | null }[]
  problemyVse: { kod: string; imya: string; n: number; dolya: number }[]
  podpisi: { s: string; n: number; dolya: number }[]
  nachala: { s: string; n: number; dolya: number }[]
  formaty: { kod: string; imya: string; n: number; zanovo: number; drugoy: number; kopiya: number; dolyaPeredelki: number }[]
  poslednie: { postId: string; created_at: string; kod: string; imya: string; problemy: string[]; detali: any; content: string; mysl: boolean }[]
  trevoga: string[]
  pometki: { kod: string; imya: string; n: number; vzyato: number; nePerepisano: number }[]
}
export type Loaded13 = { data: Kachestvo13 | null; error: 'no_migration' | 'failed' | null }

const VIDY: Record<string, string> = { reels: 'Рилсы', carousel: 'Карусели', post: 'Посты' }
const dol = (a: number, b: number) => (b ? Math.round(a / b * 1000) / 10 : 0)

function top(rows: any[], pole: string, n = 10) {
  const s = rows.filter(r => r[pole])
  const c: Record<string, number> = {}
  for (const r of s) c[r[pole]] = (c[r[pole]] || 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ s: k, n: v, dolya: dol(v, s.length) }))
}

export function svesti(rows: any[]): Omit<Kachestvo13, 'poslednie'> {
  const poVidam = ['reels', 'carousel', 'post'].map(vid => {
    const r = rows.filter(x => x.vid === vid)
    const problemy: Record<string, number> = {}
    for (const k of Object.keys(PROBLEMY)) problemy[k] = dol(r.filter(x => (x.problemy || []).includes(k)).length, r.length)
    const b = r.map(x => Number(x.blizost)).filter(x => Number.isFinite(x))
    return { vid, imya: VIDY[vid], n: r.length, problemy, blizost: b.length ? Math.round(b.reduce((s, x) => s + x, 0) / b.length * 100) / 100 : null }
  })
  const problemyVse = Object.entries(PROBLEMY).map(([kod, imya]) => {
    const n = rows.filter(x => (x.problemy || []).includes(kod)).length
    return { kod, imya, n, dolya: dol(n, rows.length) }
  }).sort((a, b) => b.n - a.n)
  const formaty = FORMATY.map(f => {
    const r = rows.filter(x => x.format_kod === f.kod)
    const d = (k: string) => r.filter(x => Number(x.deystviya?.[k]) > 0).length
    const zanovo = d('zanovo'), drugoy = d('format')
    return { kod: f.kod, imya: f.imya, n: r.length, zanovo, drugoy, kopiya: d('copy'), dolyaPeredelki: dol(r.filter(x => Number(x.deystviya?.zanovo) > 0 || Number(x.deystviya?.format) > 0).length, r.length) }
  }).filter(x => x.n > 0).sort((a, b) => b.n - a.n)
  // пометки до переписи и чем кончилась перепись (detali.pometki, detali.perepis из pishi.ts)
  const pometki = Object.entries(POMETKI).map(([kod, imya]) => {
    let n = 0, vzyato = 0, ne = 0
    for (const r of rows) {
      n += (r.detali?.pometki || []).filter((x: any) => x.kod === kod).length
      const pp = [...(r.detali?.perepis || []), ...(r.detali?.perepisCelikom && kod === 'adresat' ? [{ kod, ...r.detali.perepisCelikom }] : [])].filter((x: any) => x.kod === kod)
      vzyato += pp.filter((x: any) => x.vzyato).length; ne += pp.filter((x: any) => !x.vzyato).length
    }
    return { kod, imya, n, vzyato, nePerepisano: ne }
  })
  return { vsego: rows.length, poVidam, problemyVse, podpisi: top(rows, 'podpis_nachalo'), nachala: top(rows, 'pervye_slova'), formaty, trevoga: vysheePoroga(rows), pometki }
}

export async function loadKachestvo13(): Promise<Loaded13> {
  try {
    const db = getSupabaseAdmin()
    const ot = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const r = await db.from('zh13_kachestvo').select('post_id, user_id, created_at, format_kod, vid, rezhim, podpis_nachalo, pervye_slova, problemy, detali, blizost, deystviya')
      .gte('created_at', ot).order('created_at', { ascending: false }).limit(5000)
    if (r.error) {
      const nm = /42P01|PGRST205|does not exist|schema cache/i.test(`${r.error.code} ${r.error.message}`)
      if (!nm) console.warn('kachestvo13 load failed:', errTag(r.error))
      return { data: null, error: nm ? 'no_migration' : 'failed' }
    }
    const rows = r.data || []
    const sProblemami = rows.filter((x: any) => (x.problemy || []).length).slice(0, 5)
    let poslednie: Kachestvo13['poslednie'] = []
    if (sProblemami.length) {
      const p = await db.from('generated_posts').select('id, content').in('id', sProblemami.map((x: any) => x.post_id))
      const byId = new Map((p.data || []).map((x: any) => [x.id, String(x.content || '')]))
      poslednie = sProblemami.map((x: any) => ({
        postId: x.post_id, created_at: x.created_at, kod: x.format_kod, imya: formatPo(x.format_kod)?.imya || x.format_kod,
        problemy: x.problemy || [], detali: x.detali || {}, content: byId.get(x.post_id) || '', mysl: x.rezhim === 'mysl',
      }))
    }
    return { data: { ...svesti(rows), poslednie }, error: null }
  } catch (e) {
    console.warn('kachestvo13 load failed:', errTag(e))
    return { data: null, error: 'failed' }
  }
}
