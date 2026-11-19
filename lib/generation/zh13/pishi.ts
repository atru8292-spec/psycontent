// zh13: один текст. Код выбирает тему (по кругу из тем анкеты), обычную ситуацию темы из данных анкеты, формат
// («Подбери сам» по кругу, своя мысль: «Просто мысль в камеру»), опору подхода (подряд не повторяется), 2-3 живых
// образца формата не на ту же тему и живой кусок для ритма; дальше один вызов писателя (gpt-6.1-sol) с текстом,
// «Как снять» и «Подойдет еще» в одном ответе, разбор и проверка кодом. Бюджет времени: рассуждение medium до 75 с,
// при таймауте вторая попытка low на остаток общего бюджета (95 с от начала запроса), вместе меньше 120 с у nginx.
import type { SupabaseClient } from '@supabase/supabase-js'
import dannye from './dannye.json'
import { callModel } from '../ai'
import { buildAuthorSettings } from '../settings'
import { GRUPPY, parseKlienty, situaciiTemy, nishaProfilya } from '@/lib/anketa'
import { FORMATY, HUKI_MYSLI, formatPo, vybratAuto, type Format13 } from './formaty'
import { oporyPsihologa, vybratOporu } from './opory'
import { prompt13, type Avtor13, type Obrazec13 } from './prompt'
import { razobrat, type Rezultat13 } from './razbor'
import { proverit, type Proverka } from './proverka'
import { taZheTema, pohozhe, shodstvo, slova } from './tekst'

export const VERSIYA = 'zh13'
const D = dannye as unknown as {
  obrazcy: Obrazec13[]
  kuski: Record<'reels' | 'carousel' | 'post', { id: string; tekst: string }[]>
  nahodkiTem: Record<string, string[]>
}

export type Zapros13 = { formatKod: string | null; mysl: string | null; tema: string | null; fromPostId: string | null }
export type Meta13 = {
  kod: string; vid: string; rezhim: 'tema' | 'mysl'; tema: string | null; mysl: string | null; situaciya: string | null
  opora: string; huk: string | null; obrazcy: string[]; kusok: string; kakSnyat: string[]; podoydet: Rezultat13['podoydet']
  nadpis: string; podpis: string; glavnoe: string; ms: number; popytki: number
}
export type Itog13 = { f: Format13; rez: Rezultat13; meta: Meta13; proverka: Proverka; syroe: string; groupId: string | null; avtor: Avtor13 }

type Proshloe = { id: string; created_at: string; topic: string | null; group_id: string | null; z: any }

export async function istoriya(db: SupabaseClient, userId: string): Promise<{ n: number; rows: Proshloe[] }> {
  const [cnt, last] = await Promise.all([
    db.from('generated_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('pipeline_version', VERSIYA),
    db.from('generated_posts').select('id, created_at, topic, group_id, check_result').eq('user_id', userId).eq('pipeline_version', VERSIYA).order('created_at', { ascending: false }).limit(30),
  ])
  const rows = (last.data || []).map((r: any) => ({ id: r.id, created_at: r.created_at, topic: r.topic, group_id: r.group_id, z: r.check_result?.zh13 || {} }))
  return { n: cnt.count || rows.length, rows }
}

export function avtorIz(profile: any): Avtor13 {
  const s = buildAuthorSettings(profile)
  const k = parseKlienty(profile?.klienty)
  const gruppy = k.groups.map(c => GRUPPY.find(g => g.kod === c)?.imya.replace(/\s*\(.*\)$/, '')).filter((x): x is string => !!x)
  const golos = s.voiceBrief ? s.voiceBrief.replace(/\n+/g, '; ')
    : s.toneVerbal ? `так ты отвечаешь клиентам, твоими словами: «${s.toneVerbal}»` : 'спокойный, разговорный'
  return {
    rod: profile?.author_gender === 'male' ? 'm' : 'f',
    vy: /на вы/.test(s.address),
    golos,
    mat: profile?.profanity === 'free' ? 'mozhno' : profile?.profanity === 'light' ? 'tochechno' : 'net',
    gruppy: gruppy.length ? gruppy : (nishaProfilya(profile) ? [nishaProfilya(profile)] : []),
    age: k.age, gender: k.gender, format: k.format,
  }
}

const temyAnkety = (profile: any): string[] => {
  const n = Array.isArray(profile?.niches) ? profile.niches.map(String).map((x: string) => x.trim()).filter(Boolean) : []
  if (n.length) return n
  const one = String(profile?.one_niche || '').trim()
  return one ? [one] : []
}

// образцы (zh11 podobrat): подачи формата по порядку, тот же вид выше, у поста образцы не из каруселей; не та же тема,
// не находки, из которых собрана тема; не похожие друг на друга; недавние у психолога реже
export function podobrat(f: Format13, tema: string, situacii: string[], mat: boolean, seed: number, nedavnie: Set<string>): Obrazec13[] {
  const svoi = new Set(D.nahodkiTem[tema] || [])
  const ok = (x: Obrazec13) => (mat || !x.mat) && !(f.vid === 'post' && x.format === 'carousel') && !svoi.has(x.id)
    && !taZheTema(tema, x.tekst) && !situacii.some(s => taZheTema(s, x.tekst))
  const kand: { x: Obrazec13; o: number }[] = []
  f.podachi.forEach((p, i) => {
    for (const x of D.obrazcy) if (x.podacha === p && ok(x) && !kand.some(k => k.x.id === x.id))
      kand.push({ x, o: (f.podachi.length - i) * 10 + (x.format === (f.vid === 'post' ? 'reels' : f.vid) ? 5 : 0) + (mat && x.mat ? 2 : 0) + ((seed * 7 + x.id.length) % 3) - (nedavnie.has(x.id) ? 6 : 0) })
  })
  kand.sort((a, b) => b.o - a.o || a.x.id.localeCompare(b.x.id))
  const out: Obrazec13[] = []
  for (const c of kand) {
    if (out.length >= 3) break
    if (out.some(o => shodstvo(o.tekst, c.x.tekst) > 0.25 || shodstvo(c.x.tekst, o.tekst) > 0.25)) continue
    out.push(c.x)
  }
  return out
}

// ситуация темы: по кругу, не из последних десяти текстов психолога
function situaciyaTemy(tema: string, n: number, bylo: string[]): string | null {
  const s = situaciiTemy(tema)
  if (!s.length) return null
  for (let i = 0; i < s.length; i++) { const x = s[(n + i) % s.length]; if (!bylo.includes(x)) return x }
  return s[n % s.length]
}

// своя мысль: ситуация только из темы анкеты, похожей на мысль
function situaciyaDlyaMysli(mysl: string, temy: string[], n: number, bylo: string[]): string | null {
  for (const t of temy) {
    const s = situaciiTemy(t)
    const pod = s.filter(x => pohozhe(mysl, x) || pohozhe(mysl, t))
    if (pod.length) return pod.find(x => !bylo.includes(x)) || pod[n % pod.length]
  }
  return null
}

// bezUcheta: прогон без базы (scripts/zh13-progon.ts), расход не пишется в usage_log боевой базы
export async function napisat(db: SupabaseClient, userId: string, profile: any, z: Zapros13, knownNames: string[], opts?: { bezUcheta?: boolean; t0?: number }): Promise<Itog13> {
  const t0 = opts?.t0 || Date.now()
  const deadline = t0 + 95000
  const { n, rows } = await istoriya(db, userId)
  let origin: Proshloe | null = null
  if (z.fromPostId) {
    const r = await db.from('generated_posts').select('id, created_at, topic, group_id, check_result').eq('id', z.fromPostId).eq('user_id', userId).maybeSingle()
    if (r.data) origin = { id: r.data.id, created_at: r.data.created_at, topic: r.data.topic, group_id: r.data.group_id, z: r.data.check_result?.zh13 || {} }
  }
  const temy = temyAnkety(profile)
  const bylyeSit = rows.map(r => r.z.situaciya).filter(Boolean)
  const mysl = (z.mysl || origin?.z?.mysl || '').trim() || null
  const rezhim: 'tema' | 'mysl' = mysl ? 'mysl' : 'tema'

  // тема: из запроса, из исходного текста («другой формат» на ту же тему), иначе по кругу, не две последние подряд
  let tema: string | null = null
  if (!mysl) {
    tema = (z.tema || origin?.z?.tema || '').trim() || null
    if (!tema && temy.length) {
      const nedavnie = rows.slice(0, 2).map(r => r.z.tema)
      for (let i = 0; i < temy.length; i++) { const t = temy[(n + i) % temy.length]; if (!nedavnie.includes(t) || temy.length <= 2) { tema = t; break } }
    }
    if (!tema) tema = 'то, с чем ко мне приходят чаще всего'
  }
  const situaciya = origin?.z?.situaciya !== undefined && origin ? origin.z.situaciya || null
    : mysl ? situaciyaDlyaMysli(mysl, temy, n, bylyeSit) : situaciyaTemy(tema!, n, bylyeSit)

  const posledFormaty = rows.map(r => r.z.kod).filter(Boolean)
  const f = formatPo(z.formatKod || '') || formatPo(mysl ? 'mysl' : vybratAuto(n, posledFormaty))!
  const opory = oporyPsihologa(profile?.approaches)
  const posledOpory = rows.map(r => r.z.opora).filter(Boolean)
  const opora = vybratOporu(opory, n, posledOpory)
  const nMysl = rows.filter(r => r.z.kod === 'mysl').length
  const huk = f.kod === 'mysl' ? HUKI_MYSLI[nMysl % HUKI_MYSLI.length] : ''
  const avtor = avtorIz(profile)
  const nedavnieObr = new Set<string>(rows.slice(0, 3).flatMap(r => r.z.obrazcy || []))
  const obrazcy = podobrat(f, tema || mysl || '', tema ? situaciiTemy(tema) : [], avtor.mat !== 'net', n, nedavnieObr)
  const kuski = D.kuski[f.vid]
  const kusok = kuski[n % kuski.length]

  const p = prompt13(avtor, { f, tema, mysl, situaciya, opora, huk, obrazcy, kusok: kusok.tekst })
  let syroe = '', popytki = 0
  for (const [effort, max] of [['medium', 60000], ['low', 30000]] as const) {
    const ms = Math.min(max, deadline - Date.now())
    if (ms < 10000) throw new Error('zh13_timeout')
    popytki++
    try {
      syroe = await callModel({ system: p.system, user: p.user, effort, verbosity: 'medium', maxTokens: 8000, timeoutMs: ms, writer: true, userId: opts?.bezUcheta ? undefined : userId, operation: 'generate_post_zh13', knownNames })
      break
    } catch (e: any) {
      const msg = String(e?.message || e?.code || e)
      // таймаут: еще раз быстрее; деньги, ключ и прочее: дальше не пробуем
      if (!/timeout|abort/i.test(msg) || effort === 'low') throw e
    }
  }
  const rez = razobrat(syroe, f)
  const proverka = proverit({
    f, syroe, tekst: rez.tekst, glavnoe: rez.glavnoe, podpis: rez.podpis, obrazcy: obrazcy.map(x => x.tekst), kusok: kusok.tekst,
    opora, poslednyayaOpora: posledOpory[0] || null, auditoriyaZhenshiny: /женщин/i.test(avtor.gender || ''),
  })
  const meta: Meta13 = {
    kod: f.kod, vid: f.vid, rezhim, tema, mysl, situaciya, opora, huk: huk || null, obrazcy: obrazcy.map(x => x.id), kusok: kusok.id,
    kakSnyat: rez.kakSnyat, podoydet: rez.podoydet, nadpis: rez.nadpis, podpis: rez.podpis, glavnoe: rez.glavnoe, ms: Date.now() - t0, popytki,
  }
  return { f, rez, meta, proverka, syroe, groupId: origin?.group_id || null, avtor }
}

export const formatyDlyaEkrana = () => FORMATY.map(f => ({ kod: f.kod, vid: f.vid, imya: f.imya, korotko: f.korotko }))
export const slovVTekste = (t: string) => slova(t).length
