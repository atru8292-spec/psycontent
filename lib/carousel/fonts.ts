// Шрифты каруселей для Satori: статичные TTF с кириллицей из public/carousel/fonts
// (Google Fonts, лицензия OFL). Satori не читает woff2 и вариативные шрифты.
import { readFile } from 'fs/promises'
import path from 'path'
import type { TemplateStyle } from './styles'
import { PAIRS } from './pairs'

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }
const DIR = path.join(process.cwd(), 'public', 'carousel', 'fonts')

const FILES: Record<TemplateStyle, [string, string, 400 | 600 | 700][]> = {
  t_redakciya: [['Oswald', 'Oswald_700Bold.ttf', 700], ['Onest', 'Onest_400Regular.ttf', 400], ['Onest', 'Onest_700Bold.ttf', 700]],
  t_premium: [['Cormorant Garamond', 'CormorantGaramond_600SemiBold.ttf', 600], ['Manrope', 'Manrope_400Regular.ttf', 400], ['Manrope', 'Manrope_600SemiBold.ttf', 600]],
  t_skrapbuk: [['Unbounded', 'Unbounded_700Bold.ttf', 700], ['PT Mono', 'PTMono_400Regular.ttf', 400]],
  t_zapiska: [['Montserrat', 'Montserrat_400Regular.ttf', 400], ['Montserrat', 'Montserrat_700Bold.ttf', 700]],
  t_perepiska: [['Onest', 'Onest_400Regular.ttf', 400], ['Onest', 'Onest_700Bold.ttf', 700]],
  t_tetrad: [['Caveat', 'Caveat_400Regular.ttf', 400], ['Caveat', 'Caveat_700Bold.ttf', 700]],
  t_plakat: [['Unbounded', 'Unbounded_700Bold.ttf', 700], ['Onest', 'Onest_400Regular.ttf', 400], ['Onest', 'Onest_700Bold.ttf', 700]],
  t_mono: [['Montserrat', 'Montserrat_700Bold.ttf', 700], ['PT Mono', 'PTMono_400Regular.ttf', 400]],
  t_zametki: [['Onest', 'Onest_400Regular.ttf', 400], ['Onest', 'Onest_700Bold.ttf', 700]],
  t_stikery: [['Caveat', 'Caveat_400Regular.ttf', 400], ['Caveat', 'Caveat_700Bold.ttf', 700]],
  t_citata: [['Cormorant Garamond', 'CormorantGaramond_600SemiBold.ttf', 600], ['Manrope', 'Manrope_400Regular.ttf', 400], ['Manrope', 'Manrope_600SemiBold.ttf', 600]],
  t_slovar: [['Cormorant Garamond', 'CormorantGaramond_600SemiBold.ttf', 600], ['Manrope', 'Manrope_400Regular.ttf', 400], ['Manrope', 'Manrope_600SemiBold.ttf', 600]],
  t_doska: [['Neucha', 'Neucha_400Regular.ttf', 400]],
  t_vozduh: [['Cormorant Garamond', 'CormorantGaramond_600SemiBold.ttf', 600], ['Manrope', 'Manrope_400Regular.ttf', 400]],
}

const cache = new Map<string, Buffer>()
async function file(name: string): Promise<Buffer> {
  const hit = cache.get(name)
  if (hit) return hit
  const data = await readFile(path.join(DIR, name))
  cache.set(name, data)
  return data
}

// шрифты стиля плюс все шрифты его пар (кнопка «Другой шрифт»)
export async function fontsFor(style: TemplateStyle): Promise<Font[]> {
  const list: [string, string, number][] = [...FILES[style]]
  for (const p of PAIRS[style]) for (const r of [p.big, p.small]) if (!list.some(x => x[0] === r.family && x[2] === r.weight)) list.push([r.family, r.file, r.weight])
  return Promise.all(list.map(async ([name, f, weight]) => ({ name, data: await file(f), weight: weight as 400 | 600 | 700, style: 'normal' as const })))
}

let paperCache: string | null = null
let chalkCache: string | null = null
export async function chalkDataUrl(): Promise<string | null> {
  if (chalkCache) return chalkCache
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'carousel', 'doska.jpg'))
    chalkCache = `data:image/jpeg;base64,${buf.toString('base64')}`
    return chalkCache
  } catch { return null }
}

export async function paperDataUrl(): Promise<string | null> {
  if (paperCache) return paperCache
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'carousel', 'paper.jpg'))
    paperCache = `data:image/jpeg;base64,${buf.toString('base64')}`
    return paperCache
  } catch { return null }
}
