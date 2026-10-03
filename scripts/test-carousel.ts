// Тесты каруселей без модели: разбор текста, проверка ответа П7, запасная раскладка, акцент, ZIP.
// Запуск: npx tsx scripts/test-carousel.ts
import assert from 'node:assert/strict'
import fs from 'fs'
import { parseCarouselText, carouselToText } from '../lib/carousel/parse'
import { checkLayout, fallbackLayout, isHeavy, norm } from '../lib/carousel/layout'
import { resolvePalette, fitScale, contrast, parsePalette, isDecor, TEMPLATE_STYLES, STYLES, PALETTES, DECORS, DECOR_STYLES } from '../lib/carousel/styles'
import { makeZip } from '../lib/carousel/zip'
import { parseDialog, slidePoses, poseFor, peepUrl, POSES, dialogToText } from '../lib/carousel/dialog'
import { fitDialogs, splitSlideText, fitCarousel } from '../lib/carousel/spec'
import { layoutBlock, lineText, hyphenCuts } from '../lib/carousel/fit'
import { auditCarousel } from '../lib/carousel/audit'

const text = `Слайд 1: Почему ночью тревога громче
Слайд 2: Днем ты занята. Ночью остаешься одна со своими мыслями.
Слайд 3: «Я просто устала»

Часто за этим: я давно не чувствую, что имею право отдыхать.
Слайд 4: Попробуй записать мысль на бумагу.
Подпись: Сама так делаю.`

const p = parseCarouselText(text)
assert.equal(p.slides.length, 4)
assert.equal(p.caption, 'Сама так делаю.')
assert.match(p.slides[2], /\n\s*\nЧасто/)
assert.equal(parseCarouselText('[Слайд 1] Обложка\n[Слайд 2] Дальше').slides.length, 2)
assert.equal(parseCarouselText(carouselToText(p.slides, p.caption)).slides.length, 4)
console.log('ok: разбор текста')

// П7 ответил правильно
const good = { slides: [
  { n: 1, role: 'cover', big: 'Почему ночью тревога громче', small: '', accent: 'громче', photo: true },
  { n: 2, role: 'text', big: 'Днем ты занята.', small: 'Ночью остаешься одна со своими мыслями.', accent: 'одна', photo: false },
  { n: 3, role: 'pair', big: '«Я просто устала»', small: 'Часто за этим: я давно не чувствую, что имею право отдыхать.', accent: 'одна', photo: false },
  { n: 4, role: 'final', big: 'Попробуй записать мысль на бумагу.', small: '', accent: 'выдумка', photo: false },
] }
const r1 = checkLayout(p.slides, good, 't_redakciya')
assert.equal(r1.fixed, 0)
assert.equal(r1.layout[0].accent, 'громче')
assert.equal(r1.layout[2].accent, null, 'тот же акцент на соседнем слайде убран')
assert.equal(r1.layout[3].accent, null, 'акцента нет в тексте')
assert.equal(r1.layout[0].photo, false, 'в редакции фото нет')
console.log('ok: проверка ответа П7')

// П7 поменял слова: этот слайд раскладывается кодом
const bad = JSON.parse(JSON.stringify(good))
bad.slides[1].small = 'Ночью ты остаешься совсем одна.'
const r2 = checkLayout(p.slides, bad, 't_premium')
assert.equal(r2.fixed, 1)
assert.equal(norm(r2.layout[1].big + ' ' + r2.layout[1].small), norm(p.slides[1]))
const r3 = checkLayout(p.slides, 'мусор', 't_zapiska')
assert.equal(r3.fixed, 4)
for (const [i, s] of fallbackLayout(p.slides, 't_skrapbuk').entries()) assert.equal(norm(`${s.big} ${s.small}`), norm(p.slides[i]))
console.log('ok: запасная раскладка не теряет слов')

assert.equal(isHeavy(['тема про суицид']), true)
assert.equal(isHeavy(['нет']), false)
// свои цвета: нечитаемое чинится, читаемое остается
const bad1 = resolvePalette('t_redakciya', { accent: '#FFFF00' })
assert.equal(bad1.pal.accent, '#111111', 'желтый акцент на белом уходит в цвет текста')
assert.equal(bad1.notes.length, 1)
const bad2 = resolvePalette('t_plakat', { bg: '#FFFFFF', text: '#F5F5F5' })
assert.equal(bad2.pal.text, '#111111', 'светлый текст на белом становится темным')
assert.equal(resolvePalette('t_redakciya', { accent: '#5B4FA0' }).pal.accent, '#5B4FA0')
assert.equal(parsePalette({ bg: 'red', text: '#000000' })?.bg, undefined, 'не hex не принимаем')
for (const st of TEMPLATE_STYLES) {
  const { pal, notes } = resolvePalette(st, null)
  assert.equal(notes.length, 0, `цвета стиля ${st} читаются сами по себе`)
  assert.ok(contrast(pal.text, pal.bg) >= 4.5, st)
  assert.ok(STYLES[st].label)
}
assert.ok(contrast('#000000', '#FFFFFF') > 20)
assert.deepEqual(fitScale(50, 60), { scale: 1, overflow: false })
assert.equal(fitScale(90, 60).overflow, false)
assert.equal(fitScale(200, 60).overflow, true)
// каждая готовая палитра читается в каждом стиле
for (const p of PALETTES) for (const st of TEMPLATE_STYLES) {
  const { pal } = resolvePalette(st, p.p)
  assert.ok(contrast(pal.text, pal.bg) >= 4.5, `${p.name} ${st}: текст`)
  if (STYLES[st].accentSurface) assert.ok(contrast(pal.text, pal.accent) >= 4.5, `${p.name} ${st}: текст на стикере`)
  else assert.ok(contrast(pal.accent, pal.bg) >= 3, `${p.name} ${st}: акцент`)
}
console.log('ok: цвета и кегль')

// узоры: только известные значения, только у стилей с однотонным фоном
assert.ok(isDecor('lenty') && isDecor('linii') && isDecor('none'))
assert.ok(!isDecor('') && !isDecor('volny') && !isDecor(null))
assert.deepEqual(DECORS.map(d => d.id), ['none', 'lenty', 'linii', 'zmeyki', 'kletka', 'dymka'])
assert.ok(isDecor('dymka') && !isDecor('Dymka'))
for (const st of DECOR_STYLES) assert.ok(TEMPLATE_STYLES.includes(st), st)
assert.ok(!DECOR_STYLES.includes('t_doska') && !DECOR_STYLES.includes('t_zapiska'), 'на бумаге и доске узор не рисуем')
assert.equal(new Set(PALETTES.map(p => p.name)).size, PALETTES.length, 'имена палитр не повторяются')
console.log('ok: узоры')

// диалог: разбор реплик, позы, человечки, раскладка
{
  const r = parseDialog('А: Я даже не знаю, с чего начать.\nБ: С чего угодно.')!
  assert.deepEqual(r.map(x => x.who), ['a', 'b'])
  assert.equal(parseDialog('А: Меня бесит! / Б: Понимаю.')!.length, 2, 'реплики через « / » в одной строке')
  assert.equal(parseDialog('Клиент (злится): Сколько можно\nПсихолог: Давай разберем')![0].pose, 'zlitsya', 'поза в скобках')
  assert.equal(parseDialog('Просто текст слайда. Без реплик.'), null)
  assert.equal(parseDialog('Вечер.\nА: потом реплика'), null, 'текст до первой реплики: не диалог')
  assert.equal(parseDialog('П: один пункт'), null, 'одна реплика с «П:» это не диалог')
  assert.equal(parseDialog('Б: Одна реплика')!.length, 1)
  assert.equal(poseFor('Меня бесит, что я опять плачу', 'a', true), 'zlitsya')
  assert.equal(poseFor('Мне страшно, а вдруг не получится', 'a', true), 'trevozhitsya')
  assert.equal(poseFor('', 'a', false), 'sidit')
  assert.deepEqual(slidePoses(r, { a: 'grustit', b: 'nope' }), { a: 'grustit', b: slidePoses(r).b }, 'поза от П7 только из списка')
  const url = peepUrl('b', 'obyasnyaet', '#123456', '#FEDCBA')
  const svg = Buffer.from(url.split(',')[1], 'base64').toString()
  assert.ok(svg.includes('#123456') && svg.includes('#FEDCBA') && !/#222222|#ffffff/i.test(svg), 'человечек в цветах палитры')
  assert.ok(svg.includes('scale(-1 1)'), 'психолог отражен, смотрит на клиента')
  for (const p of POSES) for (const w of ['a', 'b'] as const) assert.ok(peepUrl(w, p, '#000000', '#FFFFFF').startsWith('data:image/svg+xml'), p)
  const text = `Слайд 1: Обложка диалога
Слайд 2: А: Я даже не знаю, с чего начать.
Б: С чего угодно.
Слайд 3: Просто текст.
Слайд 4: Финал. Подписывайся.`
  const lay = fallbackLayout(parseCarouselText(text).slides, 't_redakciya')
  assert.equal(lay[1].role, 'dialog'); assert.equal(lay[1].big, ''); assert.equal(lay[2].role === 'dialog', false)
  // П7 разрезал диалог по big и small и дал позу: код собирает обратно, поза из списка остается
  const viaModel = checkLayout(parseCarouselText(text).slides, { slides: [{ n: 2, role: 'text', big: 'А: Я даже не знаю, с чего начать.', small: 'Б: С чего угодно.', pose: { a: 'somnevaetsya', b: 'xxx' } }] }, 't_redakciya').layout
  assert.equal(viaModel[1].role, 'dialog'); assert.deepEqual(viaModel[1].pose, { a: 'somnevaetsya' })
  for (const st of TEMPLATE_STYLES) {
    const D = fitDialogs(st, lay, { variant: 0, long: false, hasPhotos: false })[1]!
    assert.ok(D && D.bubbles.length === 2 && !D.overflow, st)
    assert.ok(D.bubbles[0].x < D.bubbles[1].x, `${st}: клиент слева, психолог справа`)
    const a = auditCarousel(st, lay, { variant: 0, long: false, hasPhotos: false })[1]
    assert.equal(a.overlaps.length + a.outOfBounds.length, 0, `${st}: ${a.overlaps} ${a.outOfBounds}`)
  }
  const sp = splitSlideText('А: раз два три\nБ: четыре пять шесть\nА: семь')!
  assert.ok(parseDialog(sp[0]) && parseDialog(sp[1]), 'диалог делится между репликами')
  const ls = splitSlideText('Что выдает усталость:\n1. Злишься.\n2. Молчишь вечерами...\n3. Все бесит.\n4. Не хочется ничего.')!
  assert.ok(ls && !/\n\d+[.)]?\s*$/.test(ls[0]) && /^\d+\. /.test(ls[1]), `список делится по пунктам: ${JSON.stringify(ls)}`)
  assert.equal(dialogToText(parseDialog('А (злится): Сколько можно')!), 'А (злится): Сколько можно')
  console.log('ok: диалог')
}

// перенос с дефисом на обложке: только когда слово шире колонки, одно деление, союз с первой частью
{
  assert.ok(hyphenCuts('гиперответственность').includes(5), 'гипер|ответственность по приставке')
  const st = { family: 'Oswald', weight: 700, upper: true, lh: 1.08, paraGap: 0.4, balance: true, hyphen: true } as any
  const small = layoutBlock('Самообесценивание и гиперответственность', st, 86, 920).paras.flat().map(lineText)
  assert.ok(!small.some(l => l.endsWith('-')), `влезает целиком: без переноса ${small}`)
  const big = layoutBlock('Самообесценивание и гиперответственность', st, 116, 920).paras.flat().map(lineText)
  assert.ok(big.some(l => l.endsWith('-')) && !big.some(l => /\sи$/i.test(l)) && big.join(' ').split('-').length <= 3, `перенос: ${big}`)
  const lay = fallbackLayout(['Самообесценивание и гиперответственность', 'Текст.', 'Финал.'], 't_redakciya')
  assert.ok(fitCarousel('t_redakciya', lay, { variant: 0, long: false, hasPhotos: false })[0].big.size >= 110, 'обложка с длинным словом крупно')
  console.log('ok: перенос на обложке')
}

// капс только до 6 слов; обложка с двоеточием или длиннее 6 слов делится на заголовок и подзаголовок
{
  const { splitCover } = require('../lib/carousel/layout') as typeof import('../lib/carousel/layout')
  const { phrasePolicy } = require('../lib/carousel/spec') as typeof import('../lib/carousel/spec')
  const c1 = splitCover({ n: 1, role: 'cover', big: 'Первая сессия: что на самом деле происходит в голове у клиента', small: '', accent: null, photo: false })
  assert.equal(c1.big, 'Первая сессия:'); assert.ok(c1.small.startsWith('что на самом'))
  const c2 = splitCover({ n: 1, role: 'cover', big: 'Срываюсь на ребенка, а потом ненавижу себя', small: '', accent: null, photo: false })
  assert.equal(c2.big, 'Срываюсь на ребенка,')
  assert.equal(splitCover({ n: 1, role: 'cover', big: 'Хватит.', small: '', accent: null, photo: false }).small, '')
  const caps = { family: 'Oswald', weight: 700, upper: true, lh: 1.08, paraGap: 0.4, max: 150, min: 76 }
  assert.equal(phrasePolicy(caps as any, 'В 3 раза чаще, чем кажется.').upper, true, 'до 6 слов капс остается')
  const long = phrasePolicy(caps as any, 'Напиши в комментариях, какая у тебя, расскажу, с чего начать', 52)
  assert.ok(!long.upper && long.max < 150 && long.maxLines === 5, 'длинная фраза строчными и меньше')
  console.log('ok: капс и обложка')
}

const zip = makeZip([{ name: 'slide-01.png', data: new Uint8Array([1, 2, 3]) }, { name: 'podpis.txt', data: new TextEncoder().encode('Привет') }])
fs.writeFileSync('/tmp/test-carousel.zip', zip)
console.log('ok: zip записан, проверь: python3 -m zipfile -t /tmp/test-carousel.zip')
