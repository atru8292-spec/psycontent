// Проверка сборки промптов и логики цепочки без настоящей модели (fetch подменен).
// Запуск: npx tsx scripts/test-generation.ts
import assert from 'node:assert/strict'
import { buildAuthorSettings, parseSignatures, parseSampleFit, voiceCoreShortOf, voiceBriefOf } from '../lib/generation/settings'
import { memoryVars, type Memory } from '../lib/generation/memory'
import { draft, refine, changedFragments, severityOf, materialFromPlan, type GenContext } from '../lib/generation/pipeline'
import { HOOK_DESCRIPTIONS, INTENT_HOOKS, INTENT_CODES, fill } from '../lib/generation/prompts'
import { P2_USER } from '../lib/generation/prompts.generated'
import { classifyCopy, formatPairs, changeRatio } from '../lib/generation/learning'
import { applyCuts } from '../lib/generation/simple'
import { pickLiveExamples, chooseMove } from '../lib/generation/hypotheses'
import { guard } from '../lib/generation/text-guard'
import * as GEN from '../lib/generation/prompts.generated'
import { normalizeCore } from '../lib/generation/core'
import { coreBlockFor, neighborsFor, checkSet, intentForFormat, adPhrases, stripAds } from '../lib/generation/group'
import { captionTail } from '../lib/generation/simple'
import { overlap, sentencesWithChains, sampleBlock, sourceLabel, isInstagramUrl, isTelegramUrl, fetchTelegramPost } from '../lib/generation/sample'

process.env.OPENAI_API_KEY = 'test'
process.env.GENERATION_CANDIDATES = '1' // цепочка ниже проверяется с одним черновиком; выбор из двух проверен отдельно в конце
process.env.GENERATION_SIMPLIFY = '0' // проход «простой язык» проверяется отдельно в конце

const profile = {
  full_name: 'Юлия Смирнова', appeal: 'На «ты» по имени', approaches: ['Психоанализ'], one_niche: 'тревога и отношения',
  client_avatar: 'женщины 28-40, работают в офисе', client_pain_phrases: 'я все делаю не так; он опять не ответил',
  tone_verbal: 'пишу спокойно, с иронией', live_voice: 'Я долго думала, что тревога это про слабость. Потом поняла, что это про любовь к контролю. Смешно, да? Но так и есть, и я с этим живу уже лет десять, иногда даже нормально.',
  voice_core: '1. Фразы средние.\n3. Заканчивает вопросом.\n4. Лексика разговорная.\n7. Тепло и иронично.\n11. Обороты: «ну вот правда», «смешно, да»\n13. Образец 1: годится, живая речь.',
  signature_phrases: ['ну вот правда', 'смешно, да'],
  story_bank: [{ text: 'Как я боялась звонить врачу и репетировала звонок вслух', level: 'personal' }, { text: 'Клиентка часто спрашивает, нормально ли плакать на сессии', level: 'practice' }],
  disclosure: 2,
}

// 1. Настройки
const s = buildAuthorSettings(profile)
assert.match(s.baseSettings, /психолог-женщина/)
assert.match(s.baseSettings, /на ты/)
assert.ok(!/\{\{/.test(s.baseSettings), 'в настройках остались плейсхолдеры')
assert.equal(s.stories.length, 1, 'самораскрытие 2 не пускает личные истории')
assert.equal(s.readerGenderRule, 'о читательнице в женском роде')
assert.deepEqual(parseSignatures(profile.voice_core), ['ну вот правда', 'смешно, да'])
assert.deepEqual(parseSampleFit(profile.voice_core, 2), [true, null])
assert.match(voiceCoreShortOf(profile.voice_core), /^3\./)
console.log('ok: настройки')

// 2. Справочники из П1
assert.equal(INTENT_CODES.length, 14)
assert.ok(INTENT_HOOKS.uznavanie?.includes('golos_chitatelya'))
assert.ok(HOOK_DESCRIPTIONS.perevorot)
assert.equal(fill('a {{x | нет}}\nb {{y}}\nc', { x: '' }), 'a нет\nc')
console.log('ok: справочники и fill')

// 3. Цепочка на подмененной модели
const calls: string[] = []
let reviewCall = 0
globalThis.fetch = (async (_url: any, init: any) => {
  const body = JSON.parse(init.body)
  const sys: string = body.messages[0].content
  const user: string = body.messages[1].content
  assert.ok(!/\{\{[a-z_]+/.test(sys + user), 'в промпте остался плейсхолдер: ' + ((sys + user).match(/\{\{[^}]+\}\}/) || [''])[0])
  assert.equal(body.temperature, undefined, 'temperature не передаем')
  let content = ''
  if (sys.startsWith('Ты редактор блога психолога')) {
    calls.push('P1')
    content = JSON.stringify({ reader_state: 'hochu_ponyat', intent: 'mehanizm', topic_for_text: 'тревога после сообщения без ответа', material: 'нет', hook_type: 'golos_chitatelya', arc: 'vyvod_snachala', detail: 'телефон экраном вниз', ending_type: 'vopros_sebe', ring: false, length: 'sredne', risks: [] })
  } else if (sys.startsWith('Ты пишешь материал')) {
    calls.push('P2')
    content = 'Он прочитал и молчит\n\nТелефон лежит экраном вниз — а ты все равно его переворачиваешь. На самом деле это про контроль. Что ты сейчас проверяешь?'
  } else if (sys.startsWith('Ты строгий редактор')) {
    reviewCall++
    calls.push(reviewCall === 1 ? 'P4' : 'P4mini')
    content = reviewCall === 1
      ? JSON.stringify({ checks: [{ id: 'shtampy', problem: true, quotes: ['На самом деле'], issue: 'штамп' }], code_findings: [{ rule: 'na_samom_dele', quote: 'На самом деле', accepted: true }], severity: 'zamechaniya' })
      : JSON.stringify({ checks: [{ id: 'svyaznost', problem: false }], severity: 'ok' })
  } else if (sys.startsWith('Ты правишь материал')) {
    calls.push('P5')
    assert.match(user, /na_samom_dele/)
    content = 'Он прочитал и молчит\n\nТелефон лежит экраном вниз, а ты все равно его переворачиваешь. За этим часто прячется контроль. Что ты сейчас проверяешь?'
  } else throw new Error('неизвестный промпт: ' + sys.slice(0, 40))
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 })
}) as any

const memory: Memory = { count: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [] }
const ctx: GenContext = { userId: '', settings: s, memory }
const req = { topic: 'тревога', format: 'post' as const, intentChoices: ['mehanizm', 'obyasnenie'] }

;(async () => {
  const d = await draft(ctx, req)
  assert.equal(d.kind, 'text')
  if (d.kind !== 'text') return
  assert.ok(d.findings.some(f => f.rule === 'na_samom_dele'), 'guard поймал «на самом деле»')
  assert.ok(d.findings.some(f => f.rule === 'tire'), 'guard поймал тире')
  const r = await refine(ctx, d.plan, req, d.text, d.findings)
  assert.ok(!/—/.test(r.text), 'в итоге нет тире')
  assert.ok(!/на самом деле/i.test(r.text))
  assert.equal(r.fixes, 1)
  assert.deepEqual(calls, ['P1', 'P2', 'P4', 'P5', 'P4mini'])
  console.log('ok: цепочка', calls.join(' → '))

  // need_detail
  calls.length = 0
  const detailCtx = ctx
  globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: 'svoya_istoriya', need_detail: 'Был ли у тебя случай, когда...?', topic_for_text: 'x', requested_intent: 'svoya_istoriya' }) } }] }))) as any
  const d2 = await draft(detailCtx, { topic: 'моя история', format: 'post', intent: 'svoya_istoriya' })
  assert.equal(d2.kind, 'need_detail')
  console.log('ok: вопрос психологу')

  // мелочи
  assert.equal(changedFragments('А. Б. В.', 'А. Б2. В.'), 'А.\nБ2.\nВ.')
  assert.equal(severityOf({ checks: [{ id: 'golos', problem: true, where: 'ves_tekst' }], severity: 'ok' }), 'perepisat')
  assert.match(materialFromPlan(ctx, { intent: 'mif', topic_for_text: 't', material: 'нет' }, req), /нет/)
  // обучение: что считается правкой
  const gen = 'Первая строка.\n\nТут [добавь: как записаться] и конец.'
  assert.equal(classifyCopy(gen, gen), 'clean')
  assert.equal(classifyCopy(gen, 'Первая строка.\n\nТут пиши в директ и конец.'), 'placeholders_only')
  assert.equal(classifyCopy(gen, 'Совсем другая первая строка, моя.\n\nТут пиши в директ, а дальше мое.'), 'edit')
  assert.ok(changeRatio('а б в г', 'а б в г') === 0)
  const pairs = formatPairs([
    { kind: 'edit_pair', before_text: 'Важно принимать свои эмоции.', after_text: 'Злиться можно, правда.', data: { change_ratio: 0.8 } },
    { kind: 'rephrase', before_text: 'Границы нужны.', after_text: 'Говори нет и не извиняйся.', data: {} },
    { kind: 'edit_pair', before_text: 'x', after_text: 'x.', data: { change_ratio: 0.01 } },
  ])
  assert.match(pairs, /^Правка 1\.\nБыло: «Границы нужны\.»/, 'перефразы идут первыми')
  assert.ok(!/Было: «x»/.test(pairs), 'мелкие правки не берем')
  // блок правок в П2: пустой не выводится, заполненный на месте
  const noPairs = fill(P2_USER, { edit_pairs: '' })
  assert.ok(!/как_автор_правит/.test(noPairs), 'пустой блок правок выпал')
  assert.ok(fill(P2_USER, { edit_pairs: pairs }).includes('Говори нет и не извиняйся'), 'правки попали в П2')
  console.log('ok: обучение на правках')

  // два черновика и выбор П2в
  process.env.GENERATION_CANDIDATES = '2'
  const seen: string[] = []
  globalThis.fetch = (async (_u: any, init: any) => {
    const b = JSON.parse(init.body)
    const sys = b.messages[0].content as string
    const user = b.messages[1].content as string
    let content = ''
    if (sys.startsWith('Ты редактор блога')) { seen.push('P1'); content = JSON.stringify({ intent: 'mehanizm', topic_for_text: 'тревога', hook_type: 'golos_chitatelya' }) }
    else if (user.includes('Ты главный редактор блога')) { seen.push('P2v:' + b.model); content = JSON.stringify({ best: 2, why: 'живее' }) }
    else { seen.push('P2'); content = user.includes('Это черновик 2') ? 'Второй черновик, живой.' : 'Первый черновик.' }
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 })
  }) as any
  const d3 = await draft(ctx, req)
  assert.equal(d3.kind, 'text')
  if (d3.kind === 'text') assert.equal(d3.text, 'Второй черновик, живой.')
  assert.deepEqual(seen, ['P1', 'P2', 'P2', 'P2v:gpt-6-luna'])
  console.log('ok: два черновика и выбор')

  // проход «простой язык»: подменяет текст, но не ломает формат
  process.env.GENERATION_CANDIDATES = '1'
  process.env.GENERATION_SIMPLIFY = '1'
  let simpleOut = 'Слайд 1: Весь вечер ждешь его сообщения\nСлайд 2: Скажешь да, и сразу отпускает'
  globalThis.fetch = (async (_u: any, init: any) => {
    const b = JSON.parse(init.body)
    const sys = b.messages[0].content as string
    let content = ''
    if (sys.startsWith('Ты редактор блога')) content = JSON.stringify({ intent: 'mehanizm', topic_for_text: 'тревога' })
    else if (sys.startsWith('Ты редактор, который делает текст')) content = simpleOut
    else content = 'Слайд 1: Возможное приглашение определяет вечер\nСлайд 2: Согласие снимает страх'
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 })
  }) as any
  const creq = { topic: 'тревога', format: 'carousel' as const, intent: 'mehanizm' }
  const d4 = await draft(ctx, creq)
  if (d4.kind === 'text') assert.equal(d4.text, 'Слайд 1: Весь вечер ждешь его сообщения\nСлайд 2: Скажешь да, и сразу отпускает')
  simpleOut = 'Проще, но без меток'
  const d5 = await draft(ctx, creq)
  if (d5.kind === 'text') assert.match(d5.text, /^Слайд 1: Возможное/)
  console.log('ok: простой язык и защита формата')

  // ножницы: режут только целые фразы, которые стоят в тексте дословно; первую фразу и метки не трогают
  const src = 'Текст на экране: Опять жду\nРечь: Жду, когда станет не страшно. Вот такой вопрос. Сегодня пишу ей.\n\nМожно признаться, что тебе одиноко.\nПодпись: Что откладываешь?'
  const c1 = applyCuts(src, ['Вот такой вопрос.', 'Можно признаться, что тебе одиноко.', 'Жду, когда станет не страшно.', 'такой вопрос', 'Нет такой фразы.', 'Что откладываешь?'])
  assert.deepEqual(c1.cut, ['Вот такой вопрос.', 'Можно признаться, что тебе одиноко.'])
  assert.equal(c1.text, 'Текст на экране: Опять жду\nРечь: Жду, когда станет не страшно. Сегодня пишу ей.\n\nПодпись: Что откладываешь?')
  const c2 = applyCuts('Речь: Раз два три. Четыре пять шесть семь.', ['Четыре пять шесть семь.'])
  assert.deepEqual(c2.cut, [], 'больше трети слов не режем')
  // обрывок: от абзаца осталась одна короткая дописка вырезанного предложения, она уходит вместе с ним
  const c3 = applyCuts('Первая фраза текста тут.\n\nИ тут вы становитесь неприятной. Требовательной. Уже плохой сотрудницей.\n\nПоследний абзац остается целым.', ['И тут вы становитесь неприятной.', 'Уже плохой сотрудницей.'], 1 / 2)
  assert.ok(!c3.text.includes('Требовательной') && c3.text.includes('Последний абзац'), 'ножницы: обрывок короче 4 слов не остается отдельной строкой')
  const c4 = applyCuts('Первая фраза текста тут.\n\nЛишняя фраза здесь. Блядь, опять звонок мамы.', ['Лишняя фраза здесь.'], 1 / 2)
  assert.ok(c4.text.includes('Блядь, опять звонок мамы.'), 'ножницы: короткая, но целая фраза из 4 слов остается')
  console.log('ok: ножницы')

  // карусель (задача karuseli-tekst): примеры только живые карусели разных видов, свой ход, проверка без ложных находок
  for (let r = 0; r < 9; r++) {
    const ex = pickLiveExamples('carousel', { allowMat: false, hot: false, calm: r % 2 === 0, rotation: r })
    assert.ok(ex.length >= 2 && ex.length <= 3, `карусель: 2-3 примера, а не ${ex.length}`)
    assert.ok(ex.every(t => t.kind === 'karusel' && !t.ai_like), 'карусель: только годные живые карусели')
    assert.equal(new Set(ex.map(t => t.sub)).size, ex.length, 'карусель: примеры разных видов')
  }
  const movesMap = Object.values(GEN).find((v: any) => v && typeof v === 'object' && 'hod_karusel' in v) as Record<string, string> | undefined
  assert.ok(movesMap, 'ход hod_karusel собран в prompts.generated.ts')
  assert.ok(chooseMove(movesMap!, 'carousel', 'uznavanie', 0).startsWith('[hod_karusel]'), 'карусель получает свой ход')
  const kar = 'Слайд 1: 6 видов усталости, от которых отпуск не спасает\nнайди свою\nСлайд 2: «Тихая Батарейка»\nсил нет даже ответить подруге :))\nСлайд 3: Хватит.\nСлайд 4: Напиши в комментариях, какая у тебя!!!\nПодпись: Отпуск помогает одной из шести.'
  const gk = guard(kar, { format: 'carousel' }).findings.map(f => f.rule)
  assert.ok(!gk.includes('dvoetochiya') && !gk.includes('dezhurnyy_final') && !gk.includes('rublenye'), `карусель: ложные находки ${gk}`)
  console.log('ok: карусель')

  // одна мысль в несколько форматов (задача sdelat-i-brend, раздел 4)
  const core = normalizeCore({
    thought: 'Бросают терапию на третьей встрече, когда становится по-настоящему страшно',
    who: 'человек, который уже был у психолога пару раз', scene: 'Вечер перед третьей встречей, пишет «заболела, перенесем»',
    mechanism: 'Первые встречи держатся на облегчении. К третьей подходишь к тому, о чем молчал.',
    others_say: 'Значит, психолог не мой', distinction: 'Страшно и не подходит это разные вещи', step: 'Скажи на встрече, что хотелось отменить',
    quote: 'Хочется сбежать именно там, где начинается работа', author_detail: '', flags: ['нет'], extra: 'x',
  }, 'mehanizm')
  assert.equal(core.intent, 'mehanizm')
  assert.ok(!('extra' in core), 'ядро: лишние поля отброшены')
  assert.equal(normalizeCore({ thought: 'а', quote: 'раз два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать' }, 'x').quote, '', 'ядро: цитата длиннее 12 слов пустая')
  const bReels = coreBlockFor(core, 'reels_monolog'), bCar = coreBlockFor(core, 'carousel'), bTg = coreBlockFor(core, 'post_tg'), bPost = coreBlockFor(core, 'post')
  assert.ok(bReels.includes('Сцена:') && bReels.includes('Фраза для цитаты') && !bReels.includes('Шаг или вопрос'), 'ядро: рилс берет сцену и цитату, без шага')
  assert.ok(bCar.includes('Шаг или вопрос') && !bCar.includes('Сцена:'), 'ядро: карусель берет шаг, без сцены')
  assert.ok(bPost.includes('личного не добавляй'), 'ядро: без детали автора пост строится без личного')
  assert.ok(bPost.includes('без цен') && !bTg.includes('без цен'), 'ядро: запрет рекламы только в Instagram')
  assert.ok(neighborsFor(['reels_monolog', 'carousel', 'post'], 'post').includes('Карусель') && !neighborsFor(['reels_monolog', 'post'], 'post').includes('Пост в Instagram'), 'соседи: без себя')
  assert.equal(intentForFormat('priglashenie', 'post'), 'kak_v_terapii', 'в Instagram на консультацию не зовем')
  assert.equal(intentForFormat('priglashenie', 'post_tg'), 'priglashenie', 'в Telegram звать можно')
  // промпт простого пути получает ядро и соседей
  const ppUser = fill(GEN.PP_USER, { core_block: bReels, neighbors: 'Карусель: ...', topic: 'т' })
  assert.ok(ppUser.includes('<ядро_мысли') && ppUser.includes('<соседи'), 'ПП: блоки ядра и соседей')
  assert.ok(!fill(GEN.PP_USER, { topic: 'т' }).includes('<ядро_мысли'), 'ПП: без ядра блока нет')
  assert.ok(fill(P2_USER, { core_block: bCar, topic_for_text: 'т' }).includes('<ядро_мысли'), 'П2: блок ядра')
  // проверка набора: повтор фразы и первой строки в позднем формате, цитата может повторяться, реклама в Instagram
  const set = checkSet([
    { format: 'reels_monolog', text: 'Текст на экране: третья встреча\nВечером ты пишешь «заболела». Первые встречи держатся на облегчении. Хочется сбежать именно там, где начинается работа.' },
    { format: 'carousel', text: 'Слайд 1: Вечером ты пишешь «заболела».\nСлайд 2: Первые встречи держатся на облегчении.\nСлайд 3: Хочется сбежать именно там, где начинается работа.' },
    { format: 'post', text: 'Третья встреча самая трудная.\n\nПервая консультация 3000 ₽, записывайтесь в директ.' },
    { format: 'post_tg', text: 'Пишу как есть. Запись на консультацию в личке.' },
  ], core.quote)
  const car = set.find(x => x.format === 'carousel')
  assert.ok(car && car.phrases.some(p => p.includes('облегчении')), 'набор: повтор фразы в карусели найден')
  assert.ok(!car!.phrases.some(p => p.includes('сбежать')), 'набор: цитата повторяться может')
  assert.ok(!set.some(x => x.index === 0), 'набор: первый материал не переписываем')
  assert.equal(car!.index, 1, 'набор: проблема привязана к номеру материала')
  const same = checkSet([{ format: 'post', text: 'Запись на консультацию открыта, пиши мне в директ.' }, { format: 'post', text: 'Первые встречи держатся на облегчении и надежде.' }], '')
  assert.ok(same.every(x => x.index === 0), 'набор: реклама старого материала не приписывается новому того же формата')
  assert.ok(checkSet([{ format: 'post', text: 'Первые встречи держатся на облегчении и надежде.' }, { format: 'post', text: 'Первые встречи держатся на облегчении и надежде.' }], '').some(x => x.index === 1), 'набор: повтор между двумя постами ловится')
  assert.ok(set.find(x => x.format === 'post')?.phrases.some(p => p.includes('₽')), 'набор: цена в Instagram найдена')
  assert.ok(!set.some(x => x.format === 'post_tg'), 'набор: в Telegram позвать можно')
  assert.equal(adPhrases('Не успеть все это нормально. Если отзывается, напиши. Дай себе скидку на усталость. Сделай запись на диктофон. Я веду 3 рубрики в блоге. Я получила отзыв от подруги.').length, 0, 'реклама: обычные фразы психолога не реклама')
  for (const ad of ['Запишись на консультацию по ссылке в профиле.', 'Пиши мне в директ слово «хочу».', 'Консультация стоит 5000.', 'Первая встреча 3000 ₽.', 'Скидка 20% до пятницы.', 'Успей, осталось 2 места.', 'Отзывы клиентов в закрепе.'])
    assert.equal(adPhrases(ad).length, 1, `реклама: «${ad}» поймана`)
  // описание под рилсом без приглашения на консультацию
  const ctxB = { userId: 'u', settings: { ...buildAuthorSettings({ ...profile, booking: 'пишите в директ' }), booking: 'пишите в директ' }, memory: { count: 3 } } as any
  for (let n = 0; n < 4; n++) assert.ok(!/консультац/u.test(captionTail({ ...ctxB, memory: { count: n } }, 'reels_monolog')), 'описание рилса без записи на консультацию')
  const stripped = stripAds('post', 'Третья встреча самая трудная.\n\nТак бывает почти у всех. Запишись на консультацию по ссылке в профиле.')
  assert.ok(!/Запишись/u.test(stripped) && /Третья встреча/u.test(stripped), 'реклама в Instagram вырезана кодом')
  assert.ok(/Запишись/u.test(stripAds('post_tg', 'Пишу как есть. Запишись на консультацию по ссылке.')), 'в Telegram приглашение остается')
  const brief = voiceBriefOf('1. Фразы короткие. Рвет мысль.\n4. Лексика разговорная.\n7. Тепло и иронично.\n8. Сравнения из кухни.\n10. не видно по образцам\n11. Обороты: «ну вот правда»')
  assert.ok(brief.split('\n').length <= 5 && /Ритм: Фразы короткие\./u.test(brief) && !/не видно/u.test(brief) && /ну вот правда/u.test(brief), 'короткий слепок: до 5 строк, без пустых пунктов')
  assert.equal(voiceBriefOf(''), '', 'без слепка короткого слепка нет')
  console.log('ok: одна мысль в несколько форматов')

  // «Сделать так же» (раздел 5)
  const orig = 'Вы думаете, что прокрастинация это лень. На самом деле мозг бережет вас от стыда за несовершенный результат. Попробуйте начать с самого маленького шага.'
  const copy = 'Ты думаешь, что дело в характере. Мозг бережет вас от стыда за несовершенный результат, вот что тут происходит.'
  const ov = overlap(orig, copy)
  assert.ok(ov.hit && ov.chains.some(c => c.includes('бережет вас от стыда')), 'так же: цепочка из 5 слов найдена')
  assert.ok(sentencesWithChains(copy, ov.chains).length === 1, 'так же: переписываем только фразу с совпадением')
  assert.ok(!overlap(orig, 'Сижу вечером и листаю ленту, а дело стоит. Страшно, что выйдет криво, поэтому я не начинаю вовсе.').hit, 'так же: свой текст про то же не совпадение')
  assert.ok(!overlap(orig, 'и вот я не знаю что и как тут').hit, 'так же: служебные слова не считаются')
  const blk = sampleBlock({ format: 'post', priem: 'чужая фраза и разбор', steps: ['сцена', 'совет', 'почему не работает'], why: 'узнавание', flags: { client_story: true, review: false, promise: false } })
  assert.ok(blk.includes('Прием: чужая фраза') && blk.includes('без клиента'), 'так же: блок писателя с пометкой про клиента')
  assert.equal(sourceLabel({ kind: 'link', url: 'https://t.me/psy_anna/123' }), 't.me/psy_anna')
  assert.ok(isInstagramUrl('https://www.instagram.com/reel/abc/') && isTelegramUrl('t.me/x/1') && !isTelegramUrl('https://instagram.com/p/1'))
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('<div class="tgme_widget_message_text js-message_text" dir="auto">Первая строка поста<br/>и вторая &quot;строка&quot; с <b>жирным</b> словом, достаточно длинная для разбора.</div>', { status: 200 })) as any
  const tg = await fetchTelegramPost('https://t.me/psy_anna/123')
  assert.ok('text' in tg && tg.text.includes('Первая строка поста\nи вторая "строка" с жирным'), 'так же: текст поста Telegram из виджета')
  globalThis.fetch = (async () => new Response('<div class="tgme_widget_message_error">Post not found</div>', { status: 200 })) as any
  const tg2 = await fetchTelegramPost('https://t.me/closed/5')
  assert.ok('error' in tg2 && tg2.error === 'closed', 'так же: закрытый канал')
  globalThis.fetch = realFetch
  console.log('ok: сделать так же')

  console.log('ok: все проверки')
})().catch(e => { console.error('FAIL', e); process.exit(1) })
