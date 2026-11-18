// Анкета 2 (19.11): кто приходит к психологу и о чем он хочет писать. Данные собраны из каталога живых находок
// (_знания/anketa-2/ANKETA-DANNYE.json, тут облегченная копия без id находок). Психолог видит темы и фразы
// только отмеченных групп и общие: детский психолог не получит тем про бизнес, пока сам не отметит обе группы.

import dannye from './dannye.json'

export type Tema = { tema: string; situacii: string[] }
export type Gruppa = { kod: string; imya: string; podskazka: string; obshaya: boolean; replika: string; temy: Tema[]; frazy: string[] }
// значение колонки onboarding_profiles.klienty (миграция 20261119100000_klienty.sql)
export type Klienty = { groups: string[]; age: string[]; gender: string | null; format: string[] }

export const GRUPPY: Gruppa[] = (dannye.gruppy as Gruppa[]).filter(g => !g.obshaya)
export const OBSHAYA: Gruppa = (dannye.gruppy as Gruppa[]).find(g => g.obshaya)!
export const KTO = dannye.kto_prihodit as { vozrast: string[]; pol: string[]; format: string[] }
// подписи чипов пола короче значений (на 375 px три чипа в одну строку)
export const POL_KOROTKO: Record<string, string> = { 'В основном женщины': 'Чаще женщины', 'В основном мужчины': 'Чаще мужчины', 'Все': 'Все' }

// короткая подпись на карточке направления (полная подсказка в dannye.json не влезает в половину ширины 375)
export const KOROTKO: Record<string, string> = {
  a: 'тревога, самооценка', b: 'пары и абьюз', v: 'дети и родители',
  g: 'карьера и деньги', d: 'утраты, расставания', n: 'развитие, учеба, мозг',
}

export const EMPTY_KLIENTY: Klienty = { groups: [], age: [], gender: null, format: [] }

export function parseKlienty(v: unknown): Klienty {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
  return {
    groups: arr(o.groups).filter(k => GRUPPY.some(g => g.kod === k)),
    age: arr(o.age).filter(x => KTO.vozrast.includes(x)),
    gender: typeof o.gender === 'string' && KTO.pol.includes(o.gender) ? o.gender : null,
    format: arr(o.format).filter(x => KTO.format.includes(x)),
  }
}

const gruppyPo = (kody: string[]) => kody.map(k => GRUPPY.find(g => g.kod === k)).filter((g): g is Gruppa => !!g)

// Темы отмеченных групп по кругу (первая тема каждой группы, потом вторые...), общие в конце.
// Так в первых восьми чипах есть темы каждой отмеченной группы.
export function temyDlya(kody: string[]): string[] {
  const gs = gruppyPo(kody)
  const out: string[] = []
  const max = Math.max(0, ...gs.map(g => g.temy.length))
  for (let i = 0; i < max; i++) for (const g of gs) if (g.temy[i]) out.push(g.temy[i].tema)
  return [...new Set([...out, ...OBSHAYA.temy.map(t => t.tema)])]
}

export function frazyDlya(kody: string[]): string[] {
  const gs = gruppyPo(kody)
  const out: string[] = []
  const max = Math.max(0, ...gs.map(g => g.frazy.length))
  for (let i = 0; i < max; i++) for (const g of gs) if (g.frazy[i]) out.push(g.frazy[i])
  return [...new Set([...out, ...OBSHAYA.frazy])]
}

// Реплики клиентки для шага «как ты отвечаешь»: первая по первой отмеченной группе, дальше остальные по кругу
export function replikiDlya(kody: string[]): string[] {
  const first = gruppyPo(kody).map(g => g.replika)
  return [...new Set([...first, ...GRUPPY.map(g => g.replika), OBSHAYA.replika])]
}

// Ситуации темы: для первой темы поста (lib/first-topic.ts)
export function situaciiTemy(tema: string): string[] {
  const t = tema.trim().toLowerCase()
  for (const g of [...GRUPPY, OBSHAYA]) {
    const hit = g.temy.find(x => x.tema.toLowerCase() === t)
    if (hit) return hit.situacii
  }
  return []
}
