// Рендер образцов шаблонных каруселей без модели и без базы: 3 карусели на каждый стиль в PNG, в трех компоновках.
// Запуск: npx tsx scripts/render-carousel-samples.tsx [папка_с_фото]
// Результат: _знания/мозг-генератора/test/karuseli/png/<стиль>/<карусель>-<слайд>.png (папка в .gitignore)
import fs from 'fs'
import path from 'path'
// тот же рендер, что у ImageResponse из next/og в роуте
// @ts-ignore: внутренний модуль Next без типов
import { ImageResponse } from 'next/dist/compiled/@vercel/og/index.node.js'
import { renderSlide, W, H } from '../lib/carousel/slides'
import { fallbackLayout } from '../lib/carousel/layout'
import { parseCarouselText } from '../lib/carousel/parse'
import { STYLES, TEMPLATE_STYLES, PALETTES, DECORS, resolvePalette, type Decor } from '../lib/carousel/styles'
import { fontsFor } from '../lib/carousel/fonts'

// Образцы и стресс-набор: scripts/carousel-samples-data.ts
import { SAMPLES } from './carousel-samples-data'

function dataUrl(p: string) {
  const ext = path.extname(p).toLowerCase() === '.png' ? 'png' : 'jpeg'
  return `data:image/${ext};base64,${fs.readFileSync(p).toString('base64')}`
}

async function main() {
  const photoDir = process.argv[2]
  const photos = photoDir && fs.existsSync(photoDir)
    ? fs.readdirSync(photoDir).filter(f => /\.(jpe?g|png)$/i.test(f)).map(f => dataUrl(path.join(photoDir, f)))
    : []
  const paperPath = path.join(process.cwd(), 'public', 'carousel', 'paper.jpg')
  const paper = fs.existsSync(paperPath) ? dataUrl(paperPath) : null
  const chalkPath = path.join(process.cwd(), 'public', 'carousel', 'doska.jpg')
  const chalk = fs.existsSync(chalkPath) ? dataUrl(chalkPath) : null
  const out = path.join(process.cwd(), '_знания', 'мозг-генератора', 'test', 'karuseli', 'png') // в .gitignore: PNG тяжелые
  // третья карусель рисуется в чужой палитре: видно, как стиль живет со своими цветами
  const own = PALETTES.find(p => p.name === 'Шалфей')!.p
  // OPTS_PHOTO=путь: еще одна карусель с настройками (рубрика, крупные номера, маркер, вторая пара шрифтов, фото на обложке)
  // AVATAR=путь: еще ряд «stress-foto», та же стресс-карусель с фото автора на финале «кто я»
  const avatarImg = process.env.AVATAR && fs.existsSync(process.env.AVATAR) ? dataUrl(process.env.AVATAR) : null
  const optPhoto = process.env.OPTS_PHOTO && fs.existsSync(process.env.OPTS_PHOTO) ? dataUrl(process.env.OPTS_PHOTO) : null
  const only = (process.env.STYLES || '').split(',').filter(Boolean)
  for (const style of TEMPLATE_STYLES.filter(x => !only.length || only.includes(x))) {
    const fonts = await fontsFor(style)
    // THEME=dark: темная тема (сейчас у Заметок), картинки в папку <стиль>_dark
    const theme = process.env.THEME === 'dark' ? 'dark' as const : undefined
    const dir = path.join(out, theme ? `${style}_dark` : style)
    fs.mkdirSync(dir, { recursive: true })
    const keys = (process.env.SAMPLES || '').split(',').filter(Boolean)
    const entries = Object.entries(SAMPLES).filter(([k]) => !keys.length || keys.includes(k))
    if (optPhoto) entries.push(['nastroyki', SAMPLES.stress])
    if (avatarImg && (!keys.length || keys.includes('stress'))) entries.push(['stress-foto', SAMPLES.stress])
    for (const [key, text] of entries) {
      const base = key === 'nastroyki' ? { rubric: 'Разбор фразы', bigNumbers: true, accentKind: 'marker' as const, coverPhoto: true } : undefined
      const opts = theme ? { ...(base || {}), theme } : base
      const { slides } = parseCarouselText(text)
      const layout = fallbackLayout(slides, style)
      // для образца: выделим одно слово на третьем слайде
      if (layout[2]) layout[2].accent = (layout[2].small || layout[2].big).split(/\s+/).find(w => w.length > 5)?.replace(/[.,!?:;«»]/g, '') || null
      const { pal } = resolvePalette(style, key === 'slovar' ? own : null)
      for (const s of layout) {
        // каждая из трех каруселей в своей компоновке: видно все три варианта стиля
        const variant = key === 'nastroyki' ? 1 : Math.max(0, ['sryvy', 'propadaet', 'slovar'].indexOf(key))
        // первая без узора, во второй и третьей узоры по очереди: по всем стилям видны все пять
        const si = TEMPLATE_STYLES.indexOf(style)
        const decor: Decor = variant === 0 ? 'none' : DECORS[1 + ((si * 2 + variant - 1) % (DECORS.length - 1))].id
        const el = renderSlide({ style, slide: s, total: layout.length, pal, handle: 'anna.psy', name: 'Анна Смирнова', about: 'Психолог, работаю с женщинами, которые устали быть удобными', signature: true, fontPair: variant, opts, avatar: key === 'stress-foto' ? avatarImg : null, photos: opts && optPhoto ? [optPhoto, ...photos] : photos, paper, chalk, variant, decor, long: layout.some(x => (x.small || '').length > 160), all: layout })
        const res = new ImageResponse(el, { width: W, height: H, fonts: fonts as any })
        fs.writeFileSync(path.join(dir, `${key}-${s.n}.png`), Buffer.from(await res.arrayBuffer()))
      }
      console.log('ok', STYLES[style].label, key, layout.length, 'слайдов')
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
