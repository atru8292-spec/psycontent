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
import { prompt13, manera, matStroka, podachaStroka, type Avtor13, type Obrazec13 } from './prompt'
import { razobrat, type Rezultat13 } from './razbor'
import { proverit, type Proverka } from './proverka'
import { taZheTema, pohozhe, shodstvo, slova } from './tekst'
import { pometit, pometitObrashcheniya, rubrikaVoprosov, type Pometka } from './pometki'
import { perepisatFrazy, perepisatPodpis, type Perepis } from './perepis'
import { podpisMoral, podpisVopros, podpisPerevertysh, moralKonca } from './proverka'
import { HUK_TEKST, type Cel, type Huk } from './formaty'
import { vybratFormat, vybratHuk, dostupen, type Proshlyy, type Uslovie, type Vybor } from './smes'
import { ranzhirovat, type Rang } from './podbor'
import { scenaDlya, scenaBlok, svestiRepliki, replikiTochno, type SverkaScen } from './sceny'

// ошибка с кодом для экрана: формат требует фактов о себе или проверенной сцены, а их нет
export class KodOshibki extends Error { constructor(public kod: 'net_faktov' | 'net_sceny') { super(kod) } }
import { PODPISI } from './prompt'
import { buildContext } from '../context'
import { zh6Write } from '../zh6/write'
import { cleanAds } from '../group'
import type { GenRequest } from '../pipeline'

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
  pometki: Pometka[]; perepis: Perepis[]; perepisCelikom?: { do: string; posle: string; vzyato: boolean }
  dvizhok?: 'zh6'; zh4?: any; pary?: string[]
  cel?: Cel; hukVid?: Huk; rang?: Rang[]; vyborPochemu?: string; scena?: string | null
  scenaIspravleno?: SverkaScen['ispravleno']
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

// Ответы «Не совсем» на прошлые тексты (26.11, решение Арины: генератор учится на реакциях). Берем вердикты not_like
// за 30 дней (generated_posts.feedback, пишет /api/voice-events), считаем причины и даем писателю одну строку.
// Только известные коды причин: свои слова человека в промпт не идут. «не та тема» про выбор темы, писателю не нужна.
const POPRAVKA: Record<string, { bylo: string; nado: string }> = {
  'слишком умно': { bylo: 'слишком заумно', nado: 'проще, бытовыми словами, без терминов' },
  'слишком сладко': { bylo: 'слишком сладко', nado: 'суше и прямее, без утешений и нежностей' },
  'не мои слова': { bylo: 'не мои слова', nado: 'ближе к тому, как автор говорит сам, без книжных оборотов' },
  'длинно': { bylo: 'слишком длинно', nado: 'короче' },
}
const razy = (n: number) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? `${n} раза` : `${n} раз`)
// feedback от новых к старым. Берем только not_like новее последнего «Да, это я» (ревью 26.11: иначе одно «длинно»
// месяц подряд пережимало бы длину). kak: ты (промпт zh13 на «ты», род автора) или автор (блок автора карусели zh6).
export function popravkiIz(feedback: { verdict?: unknown; reasons?: unknown }[], kak: 'ty-f' | 'ty-m' | 'avtor' = 'ty-f'): string {
  const n = new Map<string, number>()
  for (const f of feedback) {
    if (f?.verdict === 'mine') break
    if (f?.verdict !== 'not_like' || !Array.isArray(f.reasons)) continue
    for (const r of new Set(f.reasons)) if (typeof r === 'string' && POPRAVKA[r]) n.set(r, (n.get(r) || 0) + 1)
  }
  if (!n.size) return ''
  const kody = [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  const bylo = kody.map(k => `${POPRAVKA[k].bylo}${n.get(k)! > 1 ? ` (${razy(n.get(k)!)})` : ''}`).join(', ')
  const kto = kak === 'avtor' ? 'автор отметил' : kak === 'ty-m' ? 'ты отметил' : 'ты отметила'
  return `В прошлых текстах ${kto}: ${bylo}. Поэтому пиши ${kody.map(k => POPRAVKA[k].nado).join('; ')}.`
}
type Feedback = { verdict?: unknown; reasons?: unknown }
async function feedbackAvtora(db: SupabaseClient, userId: string): Promise<Feedback[]> {
  try {
    const r = await db.from('generated_posts').select('feedback').eq('user_id', userId).not('feedback', 'is', null)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(10)
    return r.error ? [] : (r.data || []).map((x: any) => x.feedback || {})
  } catch { return [] } // поправки не главное: без них текст пишется как раньше
}

// Тема по кругу из анкеты, не две последние подряд (общая для napisat и подсказки на экране, 26.11)
export const TEMA_ZAPASNAYA = 'то, с чем ко мне приходят чаще всего'
export function temaPoKrugu(temy: string[], n: number, rows: Proshloe[]): string {
  const nedavnie = rows.slice(0, 2).map(r => r.z.tema)
  for (let i = 0; i < temy.length; i++) { const t = temy[(n + i) % temy.length]; if (!nedavnie.includes(t) || temy.length <= 2) return t }
  return TEMA_ZAPASNAYA
}
// Какую тему возьмет napisat при пустом поле (экран «Написать» показывает ее в подсказке)
export async function sleduyushchayaTema(db: SupabaseClient, userId: string, profile: any): Promise<string | null> {
  const temy = temyAnkety(profile)
  if (!temy.length) return null
  const { n, rows } = await istoriya(db, userId)
  const t = temaPoKrugu(temy, n, rows)
  return t === TEMA_ZAPASNAYA ? null : t
}

export function avtorIz(profile: any): Avtor13 {
  const s = buildAuthorSettings(profile)
  const k = parseKlienty(profile?.klienty)
  const gruppy = k.groups.map(c => GRUPPY.find(g => g.kod === c)?.imya.replace(/\s*\(.*\)$/, '')).filter((x): x is string => !!x)
  const golos = s.voiceBrief ? s.voiceBrief.replace(/\n+/g, '; ')
    : s.toneVerbal ? `так ты отвечаешь клиентам, твоими словами: «${s.toneVerbal}»` : manera(profile?.manera).length ? 'разговорный' : 'спокойный, разговорный'
  return {
    rod: profile?.author_gender === 'male' ? 'm' : 'f',
    vy: /на вы/.test(s.address),
    golos,
    mat: profile?.profanity === 'free' ? 'mozhno' : profile?.profanity === 'light' ? 'tochechno' : profile?.profanity === 'no' ? 'strogo' : 'net',
    zvezdy: typeof profile?.mat_zvezdy === 'boolean' ? profile.mat_zvezdy : typeof profile?.habits?.mat_zvezdy === 'boolean' ? profile.habits.mat_zvezdy : undefined,
    manera: manera(profile?.manera),
    oSebe: ({ 1: 'lichnoe', 2: 'rabota', 3: 'nichego' } as const)[Number(profile?.disclosure) as 1 | 2 | 3] ?? null,
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
const RODNYE: Record<string, string[]> = {
  pov_scenka: ['pov_assoc', 'ekran'], slyshit: ['ekran', 'pov_assoc'], sebe20: ['istoriya', 'mysl'], dve_zhizni: ['mysl', 'spor'],
  film_bez: ['film_lico'], film_lico: ['film_bez', 'mysl'], golos: ['scenka'], vrednye: ['scenka'], istoriya: ['sebe20'], pov_assoc: ['ekran'],
}
export function podobrat(f: Format13, tema: string, situacii: string[], mat: boolean, seed: number, nedavnie: Set<string>): Obrazec13[] {
  const svoi = new Set(D.nahodkiTem[tema] || [])
  const ok = (x: Obrazec13) => !x.metod && (mat || !x.mat) && !(f.vid === 'post' && x.format === 'carousel') && !svoi.has(x.id)
    && !taZheTema(tema, x.tekst) && !situacii.some(s => taZheTema(s, x.tekst))
  const kand: { x: Obrazec13; o: number }[] = []
  // находки Инстаграма 19.11 размечены форматами (kody): им первое место; у форматов с одной находкой добираем
  // из родственных (RODNYE), чтобы образцов было 2-3
  for (const x of D.obrazcy) if (x.kody?.includes(f.kod) && ok(x)) kand.push({ x, o: 100 + ((seed * 7 + x.id.length) % 3) - (nedavnie.has(x.id) ? 6 : 0) })
  ;(RODNYE[f.kod] || []).forEach((k, i) => {
    for (const x of D.obrazcy) if (x.kody?.includes(k) && ok(x) && !kand.some(c => c.x.id === x.id)) kand.push({ x, o: 60 - i * 5 + ((seed * 7 + x.id.length) % 3) - (nedavnie.has(x.id) ? 6 : 0) })
  })
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
  const [{ n, rows }, feedback] = await Promise.all([istoriya(db, userId), feedbackAvtora(db, userId)])
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
    if (!tema) tema = temaPoKrugu(temy, n, rows)
  }
  const situaciya = origin?.z?.situaciya !== undefined && origin ? origin.z.situaciya || null
    : mysl ? situaciyaDlyaMysli(mysl, temy, n, bylyeSit) : situaciyaTemy(tema!, n, bylyeSit)

  const uchet = opts?.bezUcheta ? undefined : userId
  // факты о себе: своя мысль или банк историй профиля; сцена: проверенная под тему (sceny.json)
  const istoriiAvtora = buildAuthorSettings(profile).stories.map(x => x.text).filter(Boolean)
  const fakty = mysl || (istoriiAvtora.length ? istoriiAvtora.slice(0, 3).join('\n') : null)
  const scena = scenaDlya(tema, mysl, rows.slice(0, 5).map(r => r.z.scena).filter(Boolean))
  const usl: Uslovie = { fakty: !!fakty, scena: !!scena, tema: tema || mysl || '' }
  const istoriyaSmesi: Proshlyy[] = rows.map(r => ({ kod: r.z.kod, cel: r.z.cel, huk: r.z.hukVid }))
  // прошлый текст психолога: повтор обращения в начале фразы и совета с числом в двух текстах подряд
  const proshlyy = rows[0] ? `${rows[0].z.glavnoe || ''}\n${rows[0].z.podpis || ''}`.trim() : ''

  // формат: выбран психологом (смесь не мешает) или «Подбери сам»: ранжирование моделью + смесь целей (smes.ts)
  let rang: Rang[] = []
  let vybor: Vybor
  const vybran = formatPo(z.formatKod || '')
  if (vybran) {
    if (vybran.trebuet === 'fakty' && !fakty) throw new KodOshibki('net_faktov')
    if (vybran.trebuet === 'scena' && !scena) throw new KodOshibki('net_sceny')
    vybor = { kod: vybran.kod, cel: vybran.cel, huk: vybratHuk(vybran, istoriyaSmesi[0]?.huk, n) || vybran.huki[0], pochemu: 'выбран психологом' }
  } else if (n === 0) {
    // самый первый текст человека всегда пост (26.11, разбор пути нового психолога): лендинг обещает «первый пост»,
    // а из 26 форматов 19 это рилсы; сценарий рилса нельзя просто взять, его надо снимать. Рилсы и карусель
    // со второго текста и в «Эта же мысль в другом формате»
    // ранжируем все форматы: первым берем лучший пост, а «Подойдет еще» покажет и рилсы с каруселью (ревью 26.11)
    const posty = FORMATY.filter(x => x.vid === 'post' && dostupen(x, usl))
    rang = await ranzhirovat({ tema, mysl, situaciya, formaty: FORMATY.filter(x => dostupen(x, usl)), timeoutMs: Math.min(15000, deadline - Date.now() - 50000), userId: uchet, knownNames })
    const pervyy = rang.map(x => formatPo(x.kod)).find((x): x is Format13 => !!x && x.vid === 'post' && dostupen(x, usl)) || posty[n % Math.max(1, posty.length)]
    vybor = pervyy
      ? { kod: pervyy.kod, cel: pervyy.cel, huk: vybratHuk(pervyy, undefined, n) || pervyy.huki[0], pochemu: 'первый текст постом' }
      : vybratFormat([], istoriyaSmesi, n, usl)
  } else {
    rang = await ranzhirovat({ tema, mysl, situaciya, formaty: FORMATY.filter(x => dostupen(x, usl)), timeoutMs: Math.min(15000, deadline - Date.now() - 50000), userId: uchet, knownNames })
    vybor = vybratFormat(rang.map(x => x.kod), istoriyaSmesi, n, usl)
  }
  const f = formatPo(vybor.kod)!
  const opory = oporyPsihologa(profile?.approaches)
  const posledOpory = rows.map(r => r.z.opora).filter(Boolean)
  const opora = vybratOporu(opory, n, posledOpory)
  const huk = HUK_TEKST[vybor.huk] || ''
  const avtor0 = avtorIz(profile)
  const popravki = popravkiIz(feedback, avtor0.rod === 'm' ? 'ty-m' : 'ty-f')
  const avtor: Avtor13 = { ...avtor0, ...(popravki ? { popravki } : {}) }
  const nedavnieObr = new Set<string>(rows.slice(0, 3).flatMap(r => r.z.obrazcy || []))
  const obrazcy = podobrat(f, tema || mysl || '', tema ? situaciiTemy(tema) : [], (avtor.mat === 'tochechno' || avtor.mat === 'mozhno'), n, nedavnieObr)
  const kuski = D.kuski[f.vid]
  const kusok = kuski[n % kuski.length]

  // при «Подбери сам» тройка «Подойдет еще» это следующие за выбранным форматы из ранжирования (с причиной модели)
  const podoydetIzRanga = (rez: Rezultat13) => {
    const iz = rang.filter(x => x.kod !== f.kod).slice(0, 3)
    if (!iz.length) return
    rez.podoydet = [...iz, ...rez.podoydet.filter(x => !iz.some(y => y.kod === x.kod) && x.kod !== f.kod)].slice(0, 3)
  }
  // подпись: мораль переписываем всегда; вопрос подписчикам у карусели zh6 (vopros=true) и как запасной повод у остальных
  const podpisBezMorali = async (rez: Rezultat13, a: Avtor13, _mysl: string | null, _povod: string | null, voprosToje: boolean): Promise<Perepis | null> => {
    if (!rez.podpis) return null
    const moral = podpisMoral(rez.podpis), perev = podpisPerevertysh(rez.podpis), vopros = voprosToje && podpisVopros(rez.podpis)
    if (!moral && !perev && !vopros) return null
    const x = await perepisatPodpis({ podpis: rez.podpis, glavnoe: rez.glavnoe, prichina: moral ? 'moral' : perev ? 'perevertysh' : 'vopros', obrazcy: PODPISI, mat: a.mat === 'tochechno' || a.mat === 'mozhno', matPravilo: a.mat === 'strogo' ? matStroka(a) : undefined, deadline, userId: uchet, knownNames, moral: podpisMoral, vopros: podpisVopros })
    if (x.vzyato) { rez.tekst = rez.tekst.replace(rez.podpis, x.posle); rez.podpis = x.posle }
    return x
  }

  // карусель: рецепт zh6, как на проде (оценки Арины 19.11: карусели zh13 слабые во всех вариантах)
  if (f.zh6) {
    const ctx = await buildContext(db, userId, profile)
    if (opts?.bezUcheta) ctx.userId = ''
    // род читателя как у остальных форматов zh13: без рода, если аудитория не «в основном женщины» (только в этом
    // вызове, настройки прода zh6 не меняются)
    if (/мужчин/i.test(avtor.gender || '')) ctx.settings.readerGenderRule = 'о читателе в мужском роде'
    else if (!/женщин/i.test(avtor.gender || '')) ctx.settings.readerGenderRule = 'без родовых окончаний'
    // поправки по «Не совсем» и в карусели (ревью 26.11: иначе «учтем» было бы неправдой для каруселей)
    const pz = [podachaStroka(avtor.manera, 'avtor'), popravkiIz(feedback, 'avtor')].filter(Boolean).join(' ')
    if (pz) ctx.settings.popravki = pz
    const req: GenRequest = { topic: tema || (mysl || '').slice(0, 300), format: 'carousel', intent: null, intentChoices: null, userDetail: mysl }
    const r = await zh6Write(ctx, req)
    const syroe = await cleanAds(ctx, 'carousel', r.text)
    const rez = razobrat(syroe, f)
    podoydetIzRanga(rez)
    const pp = await podpisBezMorali(rez, avtor, mysl, null, true)
    const proverka = proverit({ f, syroe, tekst: rez.tekst, glavnoe: rez.glavnoe, podpis: rez.podpis, obrazcy: [], kusok: '', opora: '', poslednyayaOpora: null, auditoriyaZhenshiny: /женщин/i.test(avtor.gender || ''), mysl, proshlyy })
    if (pp) proverka.detali.perepis = [pp]
    const meta: Meta13 = {
      kod: f.kod, vid: f.vid, rezhim, tema, mysl, situaciya: null, opora: '', huk: null, hukVid: 'net', cel: vybor.cel, rang, vyborPochemu: vybor.pochemu, obrazcy: [], kusok: '', dvizhok: 'zh6', zh4: (r as any).zh4 || null,
      kakSnyat: [], podoydet: rez.podoydet, nadpis: '', podpis: rez.podpis, glavnoe: rez.glavnoe, ms: Date.now() - t0, popytki: 1, pometki: [], perepis: pp ? [pp] : [],
    }
    return { f, rez, meta, proverka, syroe, groupId: origin?.group_id || null, avtor }
  }

  const p = prompt13(avtor, { f, tema, mysl, situaciya, opora, huk, obrazcy, kusok: kusok.tekst, fakty: f.trebuet === 'fakty' ? fakty : null, scena: f.trebuet === 'scena' && scena ? scenaBlok(scena) : null })
  const pisat = async (user: string, sroki: readonly (readonly ['medium' | 'low', number])[]) => {
    for (const [effort, max] of sroki) {
      const ms = Math.min(max, deadline - Date.now())
      if (ms < 10000) throw new Error('zh13_timeout')
      popytki++
      try {
        return await callModel({ system: p.system, user, effort, verbosity: 'medium', maxTokens: 8000, timeoutMs: ms, writer: true, userId: uchet, operation: 'generate_post_zh13', knownNames })
      } catch (e: any) {
        const msg = String(e?.message || e?.code || e)
        // таймаут: еще раз быстрее; деньги, ключ и прочее: дальше не пробуем
        if (!/timeout|abort/i.test(msg) || effort === 'low') throw e
      }
    }
    throw new Error('zh13_timeout')
  }
  let popytki = 0
  let syroe = await pisat(p.user, [['medium', 60000], ['low', 30000]])
  let rez = razobrat(syroe, f)
  podoydetIzRanga(rez)
  // реплики сцены строго по записи: склеенные раскладываются по строкам с тем, кто говорит, чужие убираются
  const scenaF = f.trebuet === 'scena' && scena ? scena : null
  const svesti = (r: Rezultat13) => {
    if (!scenaF) return [] as SverkaScen['ispravleno']
    const g = svestiRepliki(r.glavnoe, scenaF)
    if (g.ispravleno.length) { r.tekst = svestiRepliki(r.tekst, scenaF).text; r.glavnoe = g.text }
    return g.ispravleno
  }
  let scenaIspravleno = svesti(rez)

  // пометки только явного (pometki.ts); «неудобные вопросы» не человеку переписываем целиком один раз, если есть время
  const pometki = pometit(rez.glavnoe, f.kod, rez.nadpis)
  let perepisCelikom: { do: string; posle: string; vzyato: boolean } | null = null
  const adresat = pometki.find(x => x.kod === 'adresat')
  if (adresat && deadline - Date.now() > 40000) {
    try {
      const raw2 = await pisat(`${p.user}\n\nВ прошлый раз адресатом рубрики было «${adresat.fraza}», а это не человек. Возьми конкретного человека из жизни зрителя, которому зритель правда хотел бы задать эти вопросы.`, [['low', 35000]])
      const rez2 = razobrat(raw2, f)
      const novyy = rubrikaVoprosov(`${rez2.nadpis}\n${rez2.glavnoe}`)
      const ok = !!rez2.glavnoe.trim() && !pometit(rez2.glavnoe, f.kod, rez2.nadpis).some(x => x.kod === 'adresat')
      perepisCelikom = { do: adresat.fraza, posle: novyy || '', vzyato: ok }
      if (ok) { syroe = raw2; rez = rez2; podoydetIzRanga(rez); scenaIspravleno = svesti(rez) }
    } catch { perepisCelikom = { do: adresat.fraza, posle: '', vzyato: false } }
  }
  // остальные пометки: перепись только помеченной фразы, текст вокруг не трогаем
  // плюс повтор обращения («Слушай,») в тексте или подряд с прошлым текстом (место может быть в подписи) и мораль
  // в конце текста: переписываются так же, одной фразой
  const pometki2 = [...(perepisCelikom?.vzyato ? pometit(rez.glavnoe, f.kod, rez.nadpis) : pometki), ...pometitObrashcheniya(rez.glavnoe, rez.podpis, proshlyy)]
  const mk = moralKonca(f, rez.tekst, rez.glavnoe, mysl)
  if (mk) pometki2.push({ kod: 'moral_konec', fraza: mk })
  for (const x of pometki2) if (!pometki.some(y => y.kod === x.kod && y.fraza === x.fraza)) pometki.push(x)
  const pr = await perepisatFrazy({ text: `${rez.glavnoe}\n\n${rez.podpis}`, kod: f.kod, nadpis: rez.nadpis, pometki: pometki2, kusok: kusok.tekst, mat: (avtor.mat === 'tochechno' || avtor.mat === 'mozhno'), matPravilo: avtor.mat === 'strogo' ? matStroka(avtor) : undefined, deadline, userId: uchet, knownNames })
  for (const x of pr.perepis) if (x.vzyato) { rez.tekst = rez.tekst.replace(x.do, x.posle); rez.glavnoe = rez.glavnoe.replace(x.do, x.posle); rez.podpis = rez.podpis.replace(x.do, x.posle) }
  // подпись с моралью: переписываем только подпись (своя мысль в конце текста моралью не считается, подпись проверяем всегда)
  const pp = await podpisBezMorali(rez, avtor, mysl, f.kod === 'voprosy' ? null : 'vopros', false)
  if (pp) pr.perepis.push(pp)

  const proverka = proverit({
    f, syroe, tekst: rez.tekst, glavnoe: rez.glavnoe, podpis: rez.podpis, obrazcy: obrazcy.map(x => x.tekst), kusok: kusok.tekst,
    opora, poslednyayaOpora: posledOpory[0] || null, auditoriyaZhenshiny: /женщин/i.test(avtor.gender || ''), mysl, proshlyy,
  })
  if (scenaF) {
    if (scenaIspravleno.length) proverka.detali.scena = scenaIspravleno
    if (!replikiTochno(rez.glavnoe, scenaF)) proverka.problemy.push('scena_repliki')
  }
  // пометки до переписи и сама перепись видны в проверке качества
  proverka.detali.pometki = pometki
  if (pr.perepis.length) proverka.detali.perepis = pr.perepis
  if (perepisCelikom) proverka.detali.perepisCelikom = perepisCelikom
  for (const x of [...pometit(rez.glavnoe, f.kod, rez.nadpis), ...pometitObrashcheniya(rez.glavnoe, rez.podpis, proshlyy)]) if (!proverka.problemy.includes(`pometka_${x.kod}`)) proverka.problemy.push(`pometka_${x.kod}`)
  const meta: Meta13 = {
    kod: f.kod, vid: f.vid, rezhim, tema, mysl, situaciya, opora, huk: huk || null, obrazcy: obrazcy.map(x => x.id), kusok: kusok.id,
    kakSnyat: rez.kakSnyat, podoydet: rez.podoydet, nadpis: rez.nadpis, podpis: rez.podpis, glavnoe: rez.glavnoe, ms: Date.now() - t0, popytki,
    pometki, perepis: pr.perepis, ...(perepisCelikom ? { perepisCelikom } : {}), pary: p.pary,
    cel: vybor.cel, hukVid: vybor.huk, rang, vyborPochemu: vybor.pochemu, scena: f.trebuet === 'scena' ? scena?.id || null : null,
    ...(scenaIspravleno.length ? { scenaIspravleno } : {}),
  }
  return { f, rez, meta, proverka, syroe, groupId: origin?.group_id || null, avtor }
}

export const formatyDlyaEkrana = () => FORMATY.map(f => ({ kod: f.kod, vid: f.vid, imya: f.imya, korotko: f.korotko }))
export const slovVTekste = (t: string) => slova(t).length
