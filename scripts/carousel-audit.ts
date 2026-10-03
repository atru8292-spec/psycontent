// Автоотчет верстки каруселей: все стили, все компоновки, с фото и без (где фото бывает), «до» и «после».
// npx tsx scripts/carousel-audit.ts
// Результат: _знания/мозг-генератора/test/karuseli/audit.md
import fs from 'fs'
import path from 'path'
import { fallbackLayout } from '../lib/carousel/layout'
import { parseCarouselText } from '../lib/carousel/parse'
import { STYLES, TEMPLATE_STYLES, VARIANTS } from '../lib/carousel/styles'
import { auditCarousel, auditOld, summarize, type SlideAudit } from '../lib/carousel/audit'
import { SAMPLES } from './carousel-samples-data'

const out = path.join(process.cwd(), '_знания', 'мозг-генератора', 'test', 'karuseli', 'audit.md')
type Sum = ReturnType<typeof summarize>
const add = (a: Sum, b: Sum): Sum => Object.fromEntries(Object.keys(a).map(k => [k, (a as any)[k] + (b as any)[k]])) as Sum
const zero = (): Sum => ({ slides: 0, overlaps: 0, outOfBounds: 0, hanging: 0, widowsBig: 0, widowsSmall: 0, belowMin: 0, overflow: 0, jumpy: 0, shortSmall: 0, capsWall: 0, coverSmall: 0, subSmall: 0, aboutBad: 0, badHyphen: 0, pillNarrow: 0 })

let totalNew = zero(), totalOld = zero()
const rows: string[] = []
const problems: string[] = []
for (const style of TEMPLATE_STYLES) {
  let sNew = zero(), sOld = zero()
  const photoModes = STYLES[style].photos === 'none' ? [false] : [false, true]
  for (const [key, text] of Object.entries(SAMPLES)) {
    const layout = fallbackLayout(parseCarouselText(text).slides, style)
    const long = layout.some(x => (x.small || '').length > 160)
    // плюс прогон с настройками: рубрика, крупные номера списка, маркер, фото на обложке (полоски) и вторая шрифтовая пара
    const optModes = [undefined, { rubric: 'Разбор фразы', bigNumbers: true, accentKind: 'marker' as const, coverPhoto: true }]
    for (let variant = 0; variant < VARIANTS; variant++) for (const hasPhotos of photoModes) for (const opts of optModes) {
      if (opts && variant !== 1) continue
      const c = { variant, long, hasPhotos: hasPhotos || !!opts, fontPair: opts ? 1 : 0, opts }
      const a = auditCarousel(style, layout, c)
      const o = auditOld(style, layout, c)
      sNew = add(sNew, summarize(a)); sOld = add(sOld, summarize(o))
      a.forEach((r: SlideAudit) => {
        const bad = [...r.overlaps.map(x => `наложение: ${x}`), ...r.outOfBounds.map(x => `за полями: ${x}`), ...(r.hanging ? [`висячих предлогов ${r.hanging}`] : []),
          ...(r.widowBig ? ['вдова в заголовке'] : []), ...r.belowMin.map(x => `мельче минимума: ${x}`), ...(r.overflow ? ['не влезает даже на минимуме (кнопка «Разделить»)'] : []),
          ...(r.longWord ? ['длинное слово уменьшило заголовок'] : []), ...(r.shortSmall ? ['короткий текст мелко на пустом слайде'] : []), ...(r.capsWall ? ['стена: капс длиннее 6 слов или больше 4 строк'] : []),
          ...(r.coverSmall ? ['обложка мельче текста на других слайдах'] : []), ...(r.subSmall ? ['подзаголовок обложки мелкий'] : []),
          ...(r.aboutBad ? ['строка про автора мелкая или бледная'] : []), ...(r.badHyphen ? ['перенос не по приставке'] : []), ...(r.pillNarrow ? ['плашка кодового слова уже 55%'] : []), ...(r.tooLong && !r.overflow ? ['длинноват: свой кегль, в интерфейсе «Разделить на два слайда»'] : [])]
        if (bad.length) problems.push(`- ${STYLES[style].label}, ${key}, компоновка ${variant}${hasPhotos ? ', с фото' : ''}${opts ? ', с настройками' : ''}, слайд ${r.n} (заголовок ${r.bigSize}, текст ${r.smallSize}): ${bad.join('; ')}`)
      })
    }
  }
  totalNew = add(totalNew, sNew); totalOld = add(totalOld, sOld)
  rows.push(`| ${STYLES[style].label} | ${sNew.slides} | ${sOld.overflow} → ${sNew.overflow} | ${sOld.outOfBounds} → ${sNew.outOfBounds} | ${sNew.overlaps} | ${sOld.hanging} → ${sNew.hanging} | ${sOld.widowsBig} → ${sNew.widowsBig} | ${sOld.belowMin} → ${sNew.belowMin} | ${sOld.jumpy} → ${sNew.jumpy} | ${sOld.shortSmall} → ${sNew.shortSmall} | ${sOld.capsWall} → ${sNew.capsWall} | ${sNew.coverSmall} | ${sNew.subSmall} | ${sNew.aboutBad} | ${sNew.badHyphen} | ${sNew.pillNarrow} |`)
}
const head = '| Стиль | слайдов | не влезает | строка шире колонки / за полями | наложения | висячие предлоги | вдовы в заголовке | мельче минимума | карусели с разным кеглем текста | короткий текст мелко | стена капса | обложка мельче других | подзаголовок мелкий | строка про автора | перенос не по приставке | плашка кода уже 55% |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'
const md = `# Автоотчет верстки каруселей

Все 14 стилей × 3 компоновки × 4 карусели (три обычные и стресс-набор: слайд из одного слова, 500 знаков, «самообесценивание и гиперответственность», список из 7 пунктов, цитата, цифры, вопрос, финал с призывом), стили с фото еще и с фото. «До» это старая логика (кегль по счету символов, перенос строк делает Satori, склейка коротких слов до 10 знаков), посчитанная тем же замером по шрифтам; «после» новый движок (lib/carousel/fit.ts, spec.ts).

${head}
${rows.join('\n')}
| Всего | ${totalNew.slides} | ${totalOld.overflow} → ${totalNew.overflow} | ${totalOld.outOfBounds} → ${totalNew.outOfBounds} | ${totalNew.overlaps} | ${totalOld.hanging} → ${totalNew.hanging} | ${totalOld.widowsBig} → ${totalNew.widowsBig} | ${totalOld.belowMin} → ${totalNew.belowMin} | ${totalOld.jumpy} → ${totalNew.jumpy} | ${totalOld.shortSmall} → ${totalNew.shortSmall} | ${totalOld.capsWall} → ${totalNew.capsWall} | ${totalNew.coverSmall} | ${totalNew.subSmall} | ${totalNew.aboutBad} | ${totalNew.badHyphen} | ${totalNew.pillNarrow} |

## Что осталось после нового движка

${problems.length ? problems.join('\n') : 'Ничего.'}
`
fs.writeFileSync(out, md)
console.log(md.split('\n## Что осталось')[0].split('\n').slice(-3).join('\n'))
console.log(`проблемных слайдов после: ${problems.length}. Отчет: ${out}`)
