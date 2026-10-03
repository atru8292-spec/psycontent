// Шрифтовые пары каждого стиля (раздел 5 задачи): психолог переключает одной кнопкой «Другой шрифт», списка всех шрифтов нет.
// Пара 0 у каждого стиля это прежние шрифты стиля, поэтому старые карусели выглядят как раньше.
// Все шрифты открытые (OFL, Roboto Condensed Apache 2.0), статичные TTF с кириллицей в public/carousel/fonts.
// Платные и сомнительные шрифты из ТГ-подборок (Arial Narrow, Sexsmith, Biro script, YHEIGHT, CHETTY) не берем:
// шрифт встраивается в картинку на сервере, лицензия должна это позволять.

import type { TemplateStyle } from './styles'

export type FontRef = { family: string; weight: number; upper?: boolean; file: string }
export type FontPair = { label: string; big: FontRef; small: FontRef; hand?: boolean }

const F = {
  oswald: { family: 'Oswald', weight: 700, file: 'Oswald_700Bold.ttf' },
  onest: { family: 'Onest', weight: 400, file: 'Onest_400Regular.ttf' },
  onestB: { family: 'Onest', weight: 700, file: 'Onest_700Bold.ttf' },
  manrope: { family: 'Manrope', weight: 400, file: 'Manrope_400Regular.ttf' },
  manropeB: { family: 'Manrope', weight: 600, file: 'Manrope_600SemiBold.ttf' },
  montserrat: { family: 'Montserrat', weight: 400, file: 'Montserrat_400Regular.ttf' },
  montserratB: { family: 'Montserrat', weight: 700, file: 'Montserrat_700Bold.ttf' },
  cormorant: { family: 'Cormorant Garamond', weight: 600, file: 'CormorantGaramond_600SemiBold.ttf' },
  unbounded: { family: 'Unbounded', weight: 700, file: 'Unbounded_700Bold.ttf' },
  ptmono: { family: 'PT Mono', weight: 400, file: 'PTMono_400Regular.ttf' },
  caveat: { family: 'Caveat', weight: 400, file: 'Caveat_400Regular.ttf' },
  caveatB: { family: 'Caveat', weight: 700, file: 'Caveat_700Bold.ttf' },
  neucha: { family: 'Neucha', weight: 400, file: 'Neucha_400Regular.ttf' },
  robotoC: { family: 'Roboto Condensed', weight: 700, file: 'RobotoCondensed_700Bold.ttf' },
  ptNarrowB: { family: 'PT Sans Narrow', weight: 700, file: 'PTSansNarrow_700Bold.ttf' },
  playfair: { family: 'Playfair Display', weight: 400, file: 'PlayfairDisplay_400Regular.ttf' },
  playfairB: { family: 'Playfair Display', weight: 700, file: 'PlayfairDisplay_700Bold.ttf' },
  // курсив отдельным семейством: Satori ищет шрифт по имени, начертание italic в нем отдельно не нужно
  playfairI: { family: 'Playfair Italic', weight: 400, file: 'PlayfairDisplay_400Regular_Italic.ttf' },
  prata: { family: 'Prata', weight: 400, file: 'Prata_400Regular.ttf' },
  marck: { family: 'Marck Script', weight: 400, file: 'MarckScript_400Regular.ttf' },
  bad: { family: 'Bad Script', weight: 400, file: 'BadScript_400Regular.ttf' },
  yanone: { family: 'Yanone Kaffeesatz', weight: 700, file: 'YanoneKaffeesatz_700Bold.ttf' },
} satisfies Record<string, FontRef>
const up = (f: FontRef): FontRef => ({ ...f, upper: true })

export const PAIRS: Record<TemplateStyle, FontPair[]> = {
  t_redakciya: [
    { label: 'Журнал', big: up(F.oswald), small: F.onest },
    { label: 'Узкий', big: up(F.robotoC), small: F.onest },
    { label: 'Антиква', big: F.playfairB, small: F.onest },
  ],
  t_perepiska: [
    { label: 'Обычный', big: F.onestB, small: F.onest },
    { label: 'Мягкий', big: F.manropeB, small: F.manrope },
    { label: 'Плотный', big: F.montserratB, small: F.montserrat },
  ],
  t_zametki: [
    { label: 'Обычный', big: F.onestB, small: F.onest },
    { label: 'Мягкий', big: F.manropeB, small: F.manrope },
    { label: 'С засечками', big: F.playfairB, small: F.onest },
  ],
  t_plakat: [
    { label: 'Широкий', big: up(F.unbounded), small: F.onest },
    { label: 'Высокий', big: up(F.yanone), small: F.onest },
    { label: 'Узкий', big: up(F.robotoC), small: F.onest },
  ],
  t_tetrad: [
    { label: 'Ручка', big: F.caveatB, small: F.caveat, hand: true },
    { label: 'Прописи', big: F.marck, small: F.caveat, hand: true },
    { label: 'Почерк', big: F.bad, small: F.bad, hand: true },
  ],
  t_stikery: [
    { label: 'Маркер', big: F.caveatB, small: F.caveat, hand: true },
    { label: 'Почерк', big: F.bad, small: F.caveat, hand: true },
    { label: 'Прописи', big: F.marck, small: F.marck, hand: true },
  ],
  t_citata: [
    { label: 'Классика', big: F.cormorant, small: F.manrope },
    { label: 'Курсив', big: F.playfairI, small: F.manrope },
    { label: 'Строгий', big: F.prata, small: F.onest },
  ],
  t_slovar: [
    { label: 'Классика', big: F.cormorant, small: F.manrope },
    { label: 'Жирная антиква', big: F.playfairB, small: F.manrope },
    { label: 'Строгий', big: F.prata, small: F.manrope },
  ],
  t_doska: [
    { label: 'Мел', big: F.neucha, small: F.neucha, hand: true },
    { label: 'Почерк', big: F.bad, small: F.neucha, hand: true },
    { label: 'Прописи', big: F.marck, small: F.neucha, hand: true },
  ],
  t_vozduh: [
    { label: 'Тихий', big: F.cormorant, small: F.manrope },
    { label: 'Строгий', big: F.prata, small: F.manrope },
    { label: 'Курсив', big: F.playfairI, small: F.onest },
  ],
  t_premium: [
    { label: 'Классика', big: up(F.cormorant), small: F.manrope },
    { label: 'Кино', big: up(F.playfair), small: F.manrope },
    { label: 'Строгий', big: up(F.prata), small: F.manrope },
  ],
  t_mono: [
    { label: 'Машинка', big: up(F.montserratB), small: F.ptmono },
    { label: 'Узкий', big: up(F.robotoC), small: F.ptmono },
    { label: 'Высокий', big: up(F.yanone), small: F.ptmono },
  ],
  t_zapiska: [
    { label: 'Обычный', big: F.montserratB, small: F.montserrat },
    { label: 'Мягкий', big: F.manropeB, small: F.manrope },
    { label: 'Узкий', big: F.ptNarrowB, small: F.onest },
  ],
  t_skrapbuk: [
    { label: 'Широкий', big: up(F.unbounded), small: F.ptmono },
    { label: 'Высокий', big: up(F.yanone), small: F.ptmono },
    { label: 'Узкий', big: up(F.robotoC), small: F.ptmono },
  ],
}

export const PAIR_COUNT = 3
export const normPair = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < PAIR_COUNT ? n : 0 }
export const pairOf = (style: TemplateStyle, i: number | undefined): FontPair => PAIRS[style][normPair(i)]
// все файлы шрифтов пар (для Satori и для замера)
export const ALL_FONT_FILES: FontRef[] = Object.values(F)
