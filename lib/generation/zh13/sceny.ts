// zh13: база сцен из фильмов (sceny.json). Генератор берет только проверенные сцены, реплики только из записи,
// сюжет не досочиняет. Название техники (tehnika_ne_nazyvat) в промпт не идет: зрителю его не называем. Сцена подходит теме, если тема есть в ее списке; своей мысли, если мысль похожа на темы или
// на то, что сцена показывает.
import data from './sceny.json'
import { pohozhe } from './tekst'

export type Scena = { id: string; film: string; vid: 'фильм' | 'сериал'; sezon?: number; seriya?: number; nazvanie_serii?: string; tehnika_ne_nazyvat?: string; god: number | null; mesto: string; v_kadre: string; repliki: string[]; temy: string[]; pokazyvaet: string; istochnik: string; proverena: boolean }
export const SCENY = (data as { sceny: Scena[] }).sceny

export function scenaDlya(tema: string | null, mysl: string | null, isklyuchit: string[] = []): Scena | null {
  const ok = SCENY.filter(s => s.proverena && s.repliki.length && !isklyuchit.includes(s.id))
  if (tema) { const s = ok.find(x => x.temy.includes(tema)); if (s) return s }
  if (mysl) { const s = ok.find(x => x.temy.some(t => pohozhe(mysl, t)) || pohozhe(mysl, x.pokazyvaet)); if (s) return s }
  return null
}

export const scenaBlok = (s: Scena) => [
  `Сцена из ${s.vid === 'сериал' ? 'сериала' : 'фильма'} (бери только то, что здесь написано, сюжет и другие реплики не досочиняй, минуту не называй):`,
  `${s.vid === 'сериал' ? 'Сериал' : 'Фильм'}: «${s.film}»${s.vid === 'сериал' && s.sezon ? `, ${s.sezon} сезон, ${s.seriya} серия` : ''}${s.god ? `, ${s.god}` : ''}.`,
  `Что в кадре: ${s.v_kadre}.`,
  `Реплики героев (дословно, только эти): ${s.repliki.map(r => `«${r}»`).join(' ')}`,
  `Что эта сцена показывает: ${s.pokazyvaet}.`,
].join('\n')
