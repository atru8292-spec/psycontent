// Анкета 2 (19.11, версия 2 по TEMY-SPISOK.md): с чем работает психолог и кто к нему приходит. Данные собраны
// из каталога живых находок (_знания/anketa-2/ANKETA-DANNYE.json, тут облегченная копия без id находок).
// Психолог отмечает группы (тап по группе отмечает все ее темы, внутри можно снять); общие темы есть у всех
// и на экране не показываются. Названия тем во всех группах разные, поэтому тема однозначно знает свою группу.

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
export const temyGruppy = (kod: string) => GRUPPY.find(g => g.kod === kod)?.temy.map(t => t.tema) || []
// группа темы (своя тема и старые ниши без группы)
export const gruppaTemy = (tema: string) => GRUPPY.find(g => g.temy.some(t => t.tema === tema))?.kod || null

// Выбор на шаге «С чем работаешь»: группа и все ее темы разом; снятие группы снимает ее темы
export function vybratGruppu(groups: string[], topics: string[], kod: string): { groups: string[]; topics: string[] } {
  const svoi = temyGruppy(kod)
  if (groups.includes(kod)) return { groups: groups.filter(k => k !== kod), topics: topics.filter(t => !svoi.includes(t)) }
  return { groups: [...groups, kod], topics: [...topics.filter(t => !svoi.includes(t)), ...svoi] }
}

// Тема внутри раскрытой группы: снять или вернуть. Последняя снятая тема снимает группу,
// тема у неотмеченной группы отмечает группу с одной этой темой
export function vybratTemu(groups: string[], topics: string[], tema: string): { groups: string[]; topics: string[] } {
  const kod = gruppaTemy(tema)
  if (!kod) return { groups, topics }
  if (topics.includes(tema)) {
    const rest = topics.filter(t => t !== tema)
    const left = temyGruppy(kod).some(t => rest.includes(t))
    return { groups: left ? groups : groups.filter(k => k !== kod), topics: rest }
  }
  return { groups: groups.includes(kod) ? groups : [...groups, kod], topics: [...topics, tema] }
}

// Темы для сохранения в niches: по кругу между отмеченными группами (первая тема каждой группы, потом вторые...),
// своя тема в конце. Так one_niche и первые темы не съедены одной группой.
export function temyPoKrugu(groups: string[], topics: string[]): string[] {
  const po = gruppyPo(groups).map(g => g.temy.map(t => t.tema).filter(t => topics.includes(t)))
  const out: string[] = []
  const max = Math.max(0, ...po.map(x => x.length))
  for (let i = 0; i < max; i++) for (const x of po) if (x[i]) out.push(x[i])
  // темы без группы (старые ниши, своя тема из прошлой правки) не теряем
  return [...new Set([...out, ...topics.filter(t => !out.includes(t))])]
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

// Ситуации темы: для темы поста (lib/first-topic.ts)
export function situaciiTemy(tema: string): string[] {
  const t = tema.trim().toLowerCase()
  for (const g of [...GRUPPY, OBSHAYA]) {
    const hit = g.temy.find(x => x.tema.toLowerCase() === t)
    if (hit) return hit.situacii
  }
  return []
}

// «С чем работает» для настроек автора в генераторе. С новой анкетой это названия отмеченных групп
// (длинный список тем в строку «главная тема блога» не годится, а первая тема перекосила бы все тексты к себе);
// у старых пользователей без групп как было: одна ниша, иначе список ниш.
export function nishaProfilya(profile: { klienty?: unknown; one_niche?: unknown; niches?: unknown }): string {
  const gs = gruppyPo(parseKlienty(profile.klienty).groups).map(g => g.imya.replace(/\s*\(.*\)$/, ''))
  if (gs.length) return gs.join(', ')
  const one = String(profile.one_niche || '').trim()
  if (one) return one
  return Array.isArray(profile.niches) ? profile.niches.map(String).filter(Boolean).join(', ') : String(profile.niches || '')
}
