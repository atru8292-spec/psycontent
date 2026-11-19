// zh13: смесь целей в блоге психолога (задача 19.11, часть 4). На каждые 5 текстов: 2 узнавание, 1 польза, 1 спор,
// 1 доверие; код считает по истории текстов психолога (окно = тексты с начала текущей пятерки). Спорный тезис не два
// раза подряд и не на тяжелых темах. Формат и вид хука не два раза подряд. При «Подбери сам» модель ранжирует форматы
// под тему (podbor.ts), код берет первый из ранжирования, который держит смесь; если такого нет, по кругу KRUG_AUTO.
import { FORMATY, KRUG_AUTO, formatPo, type Cel, type Huk, type Format13 } from './formaty'

export const KVOTA: Record<Cel, number> = { uznavanie: 2, polza: 1, spor: 1, doverie: 1 }
export type Proshlyy = { kod?: string; cel?: Cel; huk?: Huk }

// тяжелые темы, где спорный тезис не берем (утрата и горе, насилие и абьюз, самоповреждение)
const TYAZHELO = /(утрат|горе(?!\p{L})|смерт|умер|похорон|насили|абьюз|избиен|бьет|самоповрежд|суицид|режет себя|нарцисс|притянула|как уйти и не вернуться)/iu
export const tyazhelayaTema = (t: string) => TYAZHELO.test(t)

export type Uslovie = { fakty: boolean; scena: boolean; tema: string }
export const dostupen = (f: Format13, u: Uslovie) => (f.trebuet !== 'fakty' || u.fakty) && (f.trebuet !== 'scena' || u.scena)

// сколько каждой цели еще нужно в текущей пятерке
export function nuzhno(istoriya: Proshlyy[], n: number): Record<Cel, number> {
  const blok = istoriya.slice(0, n % 5)
  const out = { ...KVOTA }
  for (const x of blok) if (x.cel && out[x.cel] > 0) out[x.cel]--
  return out
}

// вид хука: первый из подходящих формату, не тот, что в прошлом тексте, по кругу с номера n
export function vybratHuk(f: Format13, poslednij: Huk | undefined, n: number): Huk | null {
  const h = f.huki
  for (let i = 0; i < h.length; i++) { const x = h[(n + i) % h.length]; if (x !== poslednij || x === 'net') return x }
  return null
}

export type Vybor = { kod: string; huk: Huk; cel: Cel; pochemu: string }

export function vybratFormat(rang: string[], istoriya: Proshlyy[], n: number, u: Uslovie): Vybor {
  const last = istoriya[0] || {}
  const need = nuzhno(istoriya, n)
  const kandidaty = [...new Set([...rang, ...KRUG_AUTO.slice(n % KRUG_AUTO.length), ...KRUG_AUTO, ...FORMATY.map(f => f.kod)])]
    .map(k => formatPo(k)).filter((f): f is Format13 => !!f && dostupen(f, u))
  const ok = (f: Format13, strogo: { kvota: boolean; huk: boolean }) => {
    if (f.kod === last.kod) return null
    if (f.cel === 'spor' && (last.cel === 'spor' || tyazhelayaTema(u.tema))) return null
    if (strogo.kvota && need[f.cel] <= 0) return null
    const huk = vybratHuk(f, strogo.huk ? last.huk : undefined, n)
    return huk ? { kod: f.kod, huk, cel: f.cel } : null
  }
  // строго (смесь и хук), потом без смеси, потом без хука; первый в ранжировании модели выигрывает
  for (const [strogo, pochemu] of [[{ kvota: true, huk: true }, 'смесь'], [{ kvota: false, huk: true }, 'вне смеси'], [{ kvota: false, huk: false }, 'вне смеси, хук повтор']] as const) {
    for (const f of kandidaty) {
      const v = ok(f, strogo)
      if (v) return { ...v, pochemu: rang.includes(f.kod) ? `${pochemu}, ранг ${rang.indexOf(f.kod) + 1}` : `${pochemu}, по кругу` }
    }
  }
  const f = formatPo('mysl')!
  return { kod: f.kod, huk: 'esli', cel: f.cel, pochemu: 'запас' }
}
