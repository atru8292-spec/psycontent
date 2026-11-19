// zh13: база сцен из фильмов (sceny.json). Генератор берет только проверенные сцены, реплики только из записи,
// сюжет не досочиняет. Название техники (tehnika_ne_nazyvat) в промпт не идет: зрителю его не называем. Сцена подходит теме, если тема есть в ее списке; своей мысли, если мысль похожа на темы или
// на то, что сцена показывает. У каждой реплики есть, кто говорит (kto); в тексте реплики стоят по одной строкой
// «Кто: «текст»» ровно как в записи: склеенные, переписанные и чужие реплики код раскладывает обратно или убирает
// (svestiRepliki, правка Арины 19.11 после «Леди Берд», где реплики мамы и дочери склеились в одну).
import data from './sceny.json'
import { pohozhe, slova } from './tekst'

export type Replika = { kto: string; tekst: string }
export type Scena = { id: string; film: string; vid: 'фильм' | 'сериал'; sezon?: number; seriya?: number; nazvanie_serii?: string; tehnika_ne_nazyvat?: string; god: number | null; mesto: string; v_kadre: string; repliki: Replika[]; temy: string[]; pokazyvaet: string; istochnik: string; proverena: boolean }
export const SCENY = (data as { sceny: Scena[] }).sceny

export function scenaDlya(tema: string | null, mysl: string | null, isklyuchit: string[] = []): Scena | null {
  const ok = SCENY.filter(s => s.proverena && s.repliki.length && !isklyuchit.includes(s.id))
  if (tema) { const s = ok.find(x => x.temy.includes(tema)); if (s) return s }
  if (mysl) { const s = ok.find(x => x.temy.some(t => pohozhe(mysl, t)) || pohozhe(mysl, x.pokazyvaet)); if (s) return s }
  return null
}

export const strokaRepliki = (r: Replika) => `${r.kto}: «${r.tekst}»`

export const scenaBlok = (s: Scena) => [
  `Сцена из ${s.vid === 'сериал' ? 'сериала' : 'фильма'} (бери только то, что здесь написано, сюжет и другие реплики не досочиняй, минуту не называй):`,
  `${s.vid === 'сериал' ? 'Сериал' : 'Фильм'}: «${s.film}»${s.vid === 'сериал' && s.sezon ? `, ${s.sezon} сезон, ${s.seriya} серия` : ''}${s.god ? `, ${s.god}` : ''}.`,
  `Что в кадре: ${s.v_kadre}.`,
  `Реплики героев (дословно, только эти, каждая отдельной строкой с тем, кто говорит, как здесь; не склеивай и не меняй):`,
  ...s.repliki.map(strokaRepliki),
  `Что эта сцена показывает: ${s.pokazyvaet}.`,
].join('\n')

// похожесть реплик: доля общих основ слов (первые 4 буквы) от меньшей реплики; порядок слов и окончания не важны
const osnovy = (t: string) => new Set(slova(t).map(w => w.slice(0, 4)))
function pohozhest(a: string, b: string): number {
  const A = osnovy(a), B = osnovy(b)
  if (!A.size || !B.size) return 0
  let k = 0; for (const x of A) if (B.has(x)) k++
  return k / Math.min(A.size, B.size)
}

const norm = (s: string) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim()
const KAVYCHKI = /[«"“„]([^«»"“”„]+)[»"”]/gu
// метка роли в начале строки («Мама:», «Бен:», «Кадр 3:»)
const METKA = /^\s*([А-ЯЁA-Z][^:«»"\n]{0,30}):\s*/u
const NE_SCENA = /^(психолог|я|ты|автор|кадр\s*\d*|текст на экране|надпись|речь|подпись|в кадре)$/iu

// строка сцены: вся строка (без метки) это реплика в кавычках, своих слов вокруг нет
function replikaStroki(line: string): { metka: string; tekst: string } | null {
  const m = line.match(METKA)
  const metka = m ? m[1].trim() : ''
  if (metka && NE_SCENA.test(metka)) return null
  const rest = m ? line.slice(m[0].length) : line
  const q = [...rest.matchAll(KAVYCHKI)].map(x => x[1].trim())
  if (!q.length) return null
  if (norm(rest.replace(KAVYCHKI, ' ')).length) return null
  return { metka, tekst: q.join(' ') }
}

export type SverkaScen = { text: string; ispravleno: { bylo: string; stalo: string[] }[]; ok: boolean }

// раскладывает реплики сцены по записи: склеенные делит на строки, метку ставит по записи, похожую заменяет на
// записанную, придуманную (ни на что не похожа) убирает
export function svestiRepliki(text: string, s: Scena): SverkaScen {
  const R = s.repliki.map(r => ({ r, n: norm(r.tekst) }))
  const kto = new Set(s.repliki.map(r => r.kto))
  const ispravleno: SverkaScen['ispravleno'] = []
  const out: string[] = []
  for (const line of String(text).split('\n')) {
    const x = replikaStroki(line)
    if (!x) { out.push(line); continue }
    const want = norm(x.tekst)
    // покрытие записанными репликами по порядку, без остатка
    const pokr: Replika[] = []
    let ost = want
    while (ost) {
      const r = R.find(y => y.n && (ost === y.n || ost.startsWith(y.n + ' ')))
      if (!r) break
      pokr.push(r.r); ost = ost.slice(r.n.length).trim()
    }
    let stalo: string[]
    if (pokr.length && !ost) stalo = pokr.map(strokaRepliki)
    else {
      const best = R.map(y => ({ y, b: pohozhest(x.tekst, y.r.tekst) })).sort((a, b) => b.b - a.b)[0]
      // цитата без метки героя и не похожая на сцену (например, слова зрителя отдельной строкой) не реплика сцены
      if (!kto.has(x.metka) && (!best || best.b < 0.3)) { out.push(line); continue }
      stalo = best && best.b >= 0.5 ? [strokaRepliki(best.y.r)] : []
    }
    if (stalo.length !== 1 || stalo[0] !== line.trim()) ispravleno.push({ bylo: line.trim(), stalo })
    out.push(...stalo)
  }
  const t = out.join('\n').replace(/\n{3,}/g, '\n\n')
  return { text: t, ispravleno, ok: replikiTochno(t, s) }
}

// каждая строка-реплика в тексте совпадает с записью целиком (с тем, кто говорит)
export function replikiTochno(text: string, s: Scena): boolean {
  const ok = new Set(s.repliki.map(strokaRepliki))
  const kto = new Set(s.repliki.map(r => r.kto))
  return String(text).split('\n').every(line => {
    const x = replikaStroki(line)
    if (!x || ok.has(line.trim())) return true
    const pohozha = s.repliki.some(r => pohozhest(x.tekst, r.tekst) >= 0.3)
    return !kto.has(x.metka) && !pohozha
  })
}
