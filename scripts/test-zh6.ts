// Тесты zh6 (08.11) без модели и без сети: OPENAI_API_KEY=test-bez-seti npx tsx scripts/test-zh6.ts
// 1) банк примеров: формат, поля, без «ё», тире и мусора соцсетей, без контроля и авторов слепого теста;
// 2) подбор примеров: 2-3 штуки, свой формат первым, без мата для автора без мата, ротация без повтора;
// 3) проверки кодом: копия из 4 слов, «не X, а Y», мат у автора без мата, мат вставкой;
// 4) промпт: свои тексты автора раньше примеров, подписи примеров, в текстах промптов нет «ё» и длинных тире,
//    в промптах нет цепочек из 4 слов из живых текстов банка и разборов;
// 5) PROMPT_HYP=zh6 уводит simpleWrite в zh6Write, правка мест берется только если находок меньше и формат цел;
// 6) план тем: JSON разбирается, пометки кодом;
// 13) пометка «История собирательная» в подписи у кабинета, сессии и первой встречи;
// 14) надпись рилса обрубками ловится и уходит на правку мест, правило надписи одно (NADPIS).
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PRIMERY, pickPrimery, hasMat } from '../lib/generation/zh6/primery'
import { zh6Mesta, copyPieces, nadpisObrubki } from '../lib/generation/zh6/checks'
import { NADPIS } from '../lib/generation/zh6/formaty'
import { zh6Prompt, temaPometki, zh6Plan, smeshat, smeshatOshibki, formatyAvtora, odnoMnogotochie, pohozhie, zvezdochki, chooseKrug, samoGuard, priemyOf, temyZhivyeFor, peremeshat, logikaMesta, remarki, zapisPravila, reakciyaOf, introOf } from '../lib/generation/zh6/write'
import { FORMATY, formatByCode, formatBlock } from '../lib/generation/zh6/formaty'
import { KONCY } from '../lib/generation/zh6/prompt-tekst'
import { vidyFrom, grupyFrom } from '../lib/generation/zh6/vidy'
import { GRUPPY } from '../lib/generation/zh6/gruppy'
import { TEKST_SYSTEM, FORMAT_CARDS, USTROJSTVA, KONEC, SAMPLES_HEAD, PRIMERY_HEAD } from '../lib/generation/zh6/prompt-tekst'
import { TEMY_SYSTEM } from '../lib/generation/zh6/prompt-temy'
import { simpleWrite } from '../lib/generation/simple'
import { sobiratelnaya, SOBIR_LINE, SOBIR_VIDY } from '../lib/generation/zh6/text'
import { checkSet } from '../lib/generation/group'
import { splitCaption } from '../components/CaptionBlock'
import { buildAuthorSettings } from '../lib/generation/settings'
import { KONTROL, ISKLYUCHIT_AVTOROV } from './zh6/data'
import { PERSONAS6 as PERSONAS } from './zh6/personas'

const mem = () => ({ count: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [] })
const ctxOf = (p: any, samples: string[]) => ({ userId: '', settings: buildAuthorSettings({ ...p, voice_core: '', voice_samples: samples.map(text => ({ text, fit: true, source: 'pasted' })) }, { rotation: 0 }), memory: mem() } as any)

async function main() {
  // 1. банк
  assert.ok(PRIMERY.length >= 40 && PRIMERY.length <= 60, `в банке ${PRIMERY.length}`)
  for (const p of PRIMERY) {
    assert.ok(['reels', 'post', 'tg', 'carousel'].includes(p.format), p.id)
    assert.ok(p.voice.length && p.smysl && p.text.length > 200, p.id)
    assert.ok(!/[ёЁ—–]/.test(p.text), `${p.id}: ё или длинное тире`)
    assert.ok(!/(?:^|\s)#[\p{L}]|@[\w.]{3,}|https?:/u.test(p.text), `${p.id}: мусор соцсетей`)
    assert.ok(!KONTROL.includes(p.id) && !ISKLYUCHIT_AVTOROV.includes(p.author), `${p.id}: контроль или автор слепого теста`)
  }
  assert.equal(new Set(PRIMERY.map(p => p.id)).size, PRIMERY.length, 'повтор id')
  console.log(`ok 1: банк ${PRIMERY.length} текстов, чистый, без контроля`)

  // 2. подбор
  const a = pickPrimery({ format: 'carousel', voice: ['berezhno'], allowMat: false, seed: 'x' })
  assert.ok(a.length >= 2 && a.length <= 3)
  assert.equal(a[0].format, 'carousel')
  assert.ok(a.every(p => !p.voice.includes('mat') && !hasMat(p.text)), 'мат автору без мата')
  const b = pickPrimery({ format: 'carousel', voice: ['berezhno'], allowMat: false, seed: 'x', exclude: a.map(p => p.id) })
  assert.ok(b.every(p => !a.some(q => q.id === p.id)), 'ротация повторяет примеры')
  const r = pickPrimery({ format: 'reels_monolog', voice: ['mat', 'zhestko'], allowMat: true, seed: 'y' })
  assert.equal(r[0].format, 'reels')
  console.log('ok 2: подбор по формату и голосу, без мата автору без мата, ротация')

  // 3. проверки
  const src = 'Если вы не можете перестать листать рилсы и заняться делом, то я скажу вам одну вещь.'
  assert.ok(copyPieces('Вот: если вы не можете перестать листать ленту, то', [src]).length, 'копия не поймана')
  assert.equal(copyPieces('И я не могу, и ты не можешь.', ['И я не могу, и ты не можешь.']).length, 0, 'частая связка коротких слов не копия')
  const m1 = zh6Mesta('Дело не в лени, а в страхе. Это бл*ть сложно.', { sources: [], allowMat: false })
  assert.ok(m1.some(x => x.code === 'ne_x_a_y') && m1.some(x => x.code === 'mat'), JSON.stringify(m1))
  const m2 = zh6Mesta('Свой, блядь, выходной ты отдаешь начальнику.', { sources: [], allowMat: true })
  assert.ok(m2.some(x => x.code === 'mat_vstavka'))
  assert.equal(zh6Mesta('Заебало терпеть, честно.', { sources: [], allowMat: true }).length, 0)
  console.log('ok 3: копия, «не X, а Y», мат автору без мата, мат вставкой')

  // 4. промпт
  const prompts = [TEKST_SYSTEM, ...Object.values(KONEC), SAMPLES_HEAD, PRIMERY_HEAD, TEMY_SYSTEM].join('\n')
  assert.ok(!/[ёЁ—–]/.test(prompts.replace(/«ё»/g, '')), 'ё или длинное тире в промптах')
  const W = (s: string) => (s.toLowerCase().replace(/ё/g, 'е').match(/[\p{L}\d]+/gu) || [])
  const grams = (s: string) => { const w = W(s), g = new Set<string>(); for (let i = 0; i + 4 <= w.length; i++) g.add(w.slice(i, i + 4).join(' ')); return g }
  // частые связки речи («один и тот же», «на ты или на вы») не в счет: считаем цепочки с тремя словами длиннее трех букв
  const pg = new Set([...grams(prompts)].filter(g => !/(?:^| )[xy](?: |$)/.test(g) && g.split(' ').filter(w => w.length > 3).length >= 3))
  const bankHits = PRIMERY.flatMap(p => [...grams(p.text)].filter(g => pg.has(g)).map(g => `${g} ← ${p.id}`))
  const walk = (d: string): string[] => readdirSync(d).flatMap(x => { const f = join(d, x); return statSync(f).isDirectory() ? walk(f) : /\.md$/.test(x) ? [f] : [] })
  const razborHits = walk(join(__dirname, '..', '_знания', 'разборы')).flatMap(f => [...grams(readFileSync(f, 'utf8'))].filter(g => pg.has(g)).map(g => `${g} ← ${f.split('_знания/')[1]}`))
  // частые связки речи («как это выглядит на», «то что он сам») бывают у всех: печатаем для глаза, падаем на трех и больше
  if (bankHits.length || razborHits.length) console.log('  общие цепочки (для глаза):', [...bankHits, ...razborHits].slice(0, 12).join('; '))
  assert.ok(bankHits.length + razborHits.length < 8, `цепочки живых текстов в промпте: ${[...bankHits, ...razborHits].join('; ')}`)
  // каталог форматов: описания аналитиков пересказаны, поэтому сверяем его с самими живыми текстами (банк, расшифровки
  // рилсов, телеграм-посты, контроль); частые связки речи печатаем для глаза, падаем на шести и больше
  const katalog = new Set([...grams(FORMATY.map(formatBlock).join('\n'))].filter(g => !/(?:^| )[xy](?: |$)/.test(g)))
  const zhivyeF = [join(__dirname, '..', '_знания', 'транскрипты-рилсов'), join(__dirname, '..', '_знания', 'живые-посты')].flatMap(d => readdirSync(d).map(x => join(d, x)))
  const zhivyeT = [...PRIMERY.map(p => p.text), ...zhivyeF.map(f => readFileSync(f, 'utf8')), ...JSON.parse(readFileSync(join(__dirname, '..', '_знания', 'мозг-генератора', 'test', 'zh6', 'kontrol.json'), 'utf8')).kontrol.map((k: any) => k.text)]
  const katHits = [...new Set(zhivyeT.flatMap(t => [...grams(t)].filter(g => katalog.has(g) && g.split(' ').filter(w => w.length > 3).length >= 3)))]
  if (katHits.length) console.log('  каталог и живые тексты (для глаза):', katHits.slice(0, 12).join('; '))
  assert.ok(katHits.length < 6, `цепочки живых текстов в каталоге форматов: ${katHits.join('; ')}`)
  const ctx = ctxOf(PERSONAS.H, ['Мой образец текста про тревогу, довольно длинный, чтобы его было видно в промпте как свой текст автора.'])
  const p = zh6Prompt(ctx, { topic: 'тревога перед звонком', format: 'carousel', intent: 'uznavanie', rol: 'doverie' })
  assert.ok(p.user.indexOf('<тексты_автора>') < p.user.indexOf('<примеры>'), 'свои тексты автора первыми')
  assert.ok(p.user.includes(PRIMERY_HEAD) && p.user.includes('Слайд 1:') && p.user.includes(KONEC.doverie.slice(0, 30)))
  assert.ok(/Автор не матерится/.test(p.user))
  console.log('ok 4: порядок блоков, подписи, промпты без ё и тире и без чужих цепочек')

  // 5. simpleWrite при zh6 и правка мест на заглушке
  process.env.OPENAI_API_KEY = 'test-bez-seti'; process.env.PROMPT_HYP = 'zh6'
  const sent: any[] = []
  const replies = [
    'Текст на экране: Опять реву\nРечь: Дело не в слезах, а в усталости. Ты плачешь, потому что устала.\nПодпись: Про слезы.',
    'Текст на экране: Опять реву\nРечь: Ты плачешь, потому что устала, и это слышно по голосу.\nПодпись: Про слезы.',
  ]
  ;(globalThis as any).fetch = async (_u: string, init: any) => {
    const body = JSON.parse(init.body); sent.push(body)
    const content = replies[Math.min(sent.length - 1, replies.length - 1)]
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200 })
  }
  const w: any = await simpleWrite(ctxOf(PERSONAS.H, []), { topic: 'слезы', format: 'reels_monolog', intent: 'podderzhka' } as any)
  assert.equal(sent.length, 2, 'писатель и правка мест')
  assert.match(sent[0].messages[0].content, /Ты пишешь за психолога/)
  assert.ok(w.zh6.pravka && !/не в слезах/.test(w.text), 'правка мест не взята')
  // правка, которая ломает метки, не берется
  sent.length = 0
  replies[1] = 'Речь: Ты плачешь, потому что устала.'
  const w2: any = await simpleWrite(ctxOf(PERSONAS.H, []), { topic: 'слезы', format: 'reels_monolog', intent: 'podderzhka' } as any)
  assert.ok(!w2.zh6.pravka && /Текст на экране/.test(w2.text), 'сломанная правка взята')
  console.log('ok 5: PROMPT_HYP=zh6 идет в zh6Write, правка мест берется только целая')

  // 6. план тем
  sent.length = 0
  replies[0] = JSON.stringify({ temy: [{ n: 1, tema: 'Всем плевать, а ты все проверяешь', situaciya: 'проверка', zadacha: 'ohvat', format: 'reels' }, { n: 2, tema: 'Отдых не нужно заслуживать — правда', situaciya: '', zadacha: 'xx', format: 'zz' }] })
  const plan = await zh6Plan(ctxOf(PERSONAS.I, []).settings, { n: 2 })
  assert.equal(plan.temy.length, 2)
  assert.ok(!/—/.test(plan.temy[1].tema) && plan.temy[1].zadacha === 'ohvat' && !!formatByCode(plan.temy[1].format), 'формат из каталога')
  assert.ok(plan.temy[1].pometki.includes('формула разрешения'))
  assert.ok(temaPometki('Лени не существует, это признак перегруза у тебя', ['Лени не существует, это признак перегруза']).includes('копия живой строки'))
  console.log('ok 6: план тем, чистка и пометки')

  // 7. zh6 v2: каталог, смешивание, многоточие, повтор тем, мат, концы, самопроверка, приемы
  assert.ok(FORMATY.length >= 30 && new Set(FORMATY.map(f => f.code)).size === FORMATY.length)
  for (const c of ['reels_bez_slov', 'reels_govoryu_slyshit', 'reels_gayd_naoborot', 'reels_neudobnye_voprosy', 'carousel_nabor_imena', 'post_udar', 'bytovoy_primer', 'popkultura']) assert.ok(formatByCode(c), c)
  const dop = formatyAvtora(ctxOf(PERSONAS.H, []).settings)
  assert.ok(!dop.some(f => f.code === 'reels_govoryu_slyshit'), 'бережному спокойному автору «говорю / слышит» с иронией')
  const plohoy = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, tema: 't' + i, format: 'reels_golova', zadacha: 'ohvat' }))
  const ok7 = smeshat(plohoy, dop, 'Таисия')
  assert.deepEqual(smeshatOshibki(ok7, dop), [], JSON.stringify(ok7.map(x => x.format)))
  assert.equal(odnoMnogotochie([{ tema: 'А...' }, { tema: 'Б…' }, { tema: 'В' }]).map(x => x.tema).join('|'), 'А...|Б|В')
  assert.ok(pohozhie('Муж не берет трубку, а вы обзваниваете больницы', 'Если муж не берет трубку, вы уже обзваниваете больницы'))
  assert.ok(!pohozhie('Похвала тоже выматывает', 'Злость после работы на близких'))
  assert.equal(zvezdochki('Это пиздец, честно'), 'Это п*здец, честно')
  assert.ok(!['vopros', 'kommentarii'].includes(chooseKrug(KONCY, ['vopros', 'replika'], 'x')), 'вопрос в конце чаще трети')
  assert.equal(samoGuard('Речь: блядь, устала.', 'Речь: ох, устала.', true), 'пропал мат')
  assert.equal(samoGuard('Речь: а б в г', 'Подпись: а б в г', true), 'сломаны метки строк')
  assert.deepEqual(priemyOf('Представьте такой разговор на консультации. Если в детстве вас хвалили...').sort(), ['detstvo', 'predstavte'])
  const zh = temyZhivyeFor(ctxOf(PERSONAS.H, []).settings, 0), zh2 = temyZhivyeFor(ctxOf(PERSONAS.H, []).settings, 1)
  assert.ok(zh.length >= 6 && zh.join() !== zh2.join() && !zh.some(x => /\*/.test(x)), 'живые темы под нишу, без мата, разные')
  const pf = zh6Prompt(ctxOf(PERSONAS.I, []), { topic: 'злость', format: 'reels_monolog', formatKod: 'reels_govoryu_slyshit', rol: 'ohvat' } as any)
  assert.ok(pf.user.includes('<формат>') && pf.format6.code === 'reels_govoryu_slyshit' && pf.user.includes('Психолог:'), 'формат из каталога в промпте')
  console.log('ok 7: каталог, смешивание форматов, многоточие, повтор тем, мат, концы, самопроверка, приемы')

  // 8. круг 3: головы 3-4 из 10, порядок перемешан, повтор по реплике, «так, стоп» и реклама терапии всегда на правку,
  // развязка сценки, кодовое слово только из профиля
  const bezGolov = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, tema: 't' + i, format: ['reels_bez_slov', 'post_udar', 'carousel_odna_mysl', 'reels_scenka_vnutr_golos', 'carousel_golos_iznutri'][i % 5], zadacha: 'ohvat' }))
  const sm8 = smeshat(bezGolov, dop, 'Таисия')
  const golov8 = sm8.filter(t => formatByCode(t.format)?.talking_head).length
  assert.ok(golov8 >= 3 && golov8 <= 4 && !smeshatOshibki(sm8, dop).length, `голов ${golov8}: ${smeshatOshibki(sm8, dop).join('; ')}`)
  const pm = peremeshat(sm8, 'Таисия|1')
  assert.ok(pm.map(t => t.tema).join() !== sm8.map(t => t.tema).join() && pm.every((t, i) => t.n === i + 1), 'порядок перемешан, n заново')
  assert.ok(pohozhie('«Я же волнуюсь» еще не дает права проверять ваш телефон', '«Я же просто волнуюсь»: зачем партнеру читать вашу переписку?'), 'повтор по реплике')
  assert.ok(!pohozhie('«Мам, я устала». «А ты думаешь, мне легко?»', '«Я же извинился». А дома все еще боятся твоего голоса'))
  assert.deepEqual(priemyOf('Я: Так, стоп. В терапии я предлагаю задержаться.').sort(), ['takstop', 'vterapii'])
  const pv = zh6Prompt(ctxOf(PERSONAS.H, []), { topic: 'дверь', format: 'reels_monolog', formatKod: 'reels_scenka_vnutr_golos', rol: 'ohvat' } as any)
  assert.ok(/Развязка сценки в этот раз/.test(pv.user) && !/так, стоп/i.test(pv.user), 'развязка сценки и без «так, стоп»')
  console.log('ok 8: головы 3-4, порядок, повтор по реплике, приемы, развязка сценки')

  // 9. круг 4: один род у «ты», одно имя у персонажа, регалии, ремарки, приглашение по правилам, реакция, представление
  const sI = ctxOf(PERSONAS.I, []).settings
  assert.ok(logikaMesta('Ты разозлилась на мать. А виноватым снова оказался ты, ты оказался крайним.', sI).some(x => x.code === 'rod'), 'род')
  assert.ok(!logikaMesta('Ты разозлился. Ты опять промолчал.', sI).length)
  assert.ok(logikaMesta('Слайд 1: Дочь Маша плачет.\nСлайд 2: Кошка Маша заходит в спальню.', sI).some(x => x.code === 'imya'), 'имя')
  assert.ok(logikaMesta('Речь: текст\nПодпись: Я Захар, 10 лет практики, гештальт.', sI).some(x => x.code === 'regalii'), 'регалии')
  assert.equal(remarki('Я: *смеется* Ну да.\n[смена]\nОна: [молчит]'), 'Я: (смеется) Ну да.\n[смена]\nОна: (молчит)')
  const zp = zapisPravila([{ tema: 'Ребенок боится', zadacha: 'zapis', reakciya: '' }, { tema: 'Мама опять кричит', zadacha: 'zapis', reakciya: '' }, { tema: 'Смешно про кофе', zadacha: 'ohvat', reakciya: 'uznavanie' }, { tema: 'Как с этим работать', zadacha: 'zapis', reakciya: '' }, ...Array.from({ length: 6 }, (_, i) => ({ tema: 'т' + i, zadacha: 'ohvat', reakciya: '' }))])
  assert.equal(zp.filter(x => x.zadacha === 'zapis').length, 1, 'запись не чаще одной на 7 тем')
  assert.ok(zp.every(x => (x.zadacha === 'zapis') === (x.reakciya === 'priglashenie')), 'реакция сведена с задачей')
  assert.equal(reakciyaOf({ reakciya: 'priglashenie' } as any, 'ohvat'), 'uznavanie')
  assert.ok(/Захар/.test(introOf(sI)) && /Гештальт/.test(introOf(sI)) && !/\d/.test(introOf(sI)))
  assert.ok(pohozhie('Со мной можно злиться, даже когда бесит', 'На сессии со мной можно спорить'))
  console.log('ok 9: род, имя, регалии, ремарки, приглашение, реакция, представление, «со мной можно»')

  // 10. zh6-prod: «никогда» только на то, чего у живых 0; живые приемы по памяти автора; пометки художника; карусель-история
  const { PRIEMY } = await import('../lib/generation/zh6/write')
  assert.deepEqual(Object.entries(PRIEMY).filter(([, v]) => v.vsegda).map(([k]) => k).sort(), ['medsovet', 'termin', 'uchebnik', 'vterapii'], 'никогда только на 4 приема')
  assert.ok(logikaMesta('Слайд 1: Миша\nСлайд 2: Нарисованный Миша стоит у окна.', sI).some(x => x.code === 'hudozhnik'), 'пометка художника')
  const ist = 'Слайд 1: Обложка\nСлайд 2: Миша приходит домой.\nМама: «Ты опять поздно».\nСлайд 3: Вот так тебе навешивают вину за злость, и ты потом еще долго оправдываешься перед всеми.\nСлайд 4: Конец.'
  assert.ok(logikaMesta(ist, sI, { format6: 'carousel_istoriya_dialog' }).some(x => x.code === 'istoriya_ty'), 'лекция на «ты» в карусели-истории')
  assert.ok(!logikaMesta(ist, sI, { format6: 'carousel_odna_mysl' }).some(x => x.code === 'istoriya_ty'), 'в других каруселях «ты» можно')
  assert.ok(logikaMesta('Слайд 1: Ты разозлился.\nСлайд 2: А потом ты извинилась.', sI).some(x => x.code === 'rod'), 'род и в карусели')
  console.log('ok 10: «никогда» только на 4 приема, пометки художника, карусель-история в третьем лице, род в карусели')

  // 11. zh6-prod шаг 2 внутри zh6: сторис и Telegram не теряются, виды рилсов, видео, порядок мата, формат из плана по типу
  const Z6 = await import('../lib/generation/zh6/write')
  const ctxP = (p: any) => ({ userId: '', settings: buildAuthorSettings({ ...p, voice_core: '', voice_samples: [] }, { rotation: 0 }), memory: mem() } as any)
  assert.equal(Z6.zh6Prompt(ctxP(PERSONAS.H), { topic: 'т', format: 'post_tg' } as any).format6.for[0], 'post')
  assert.equal(Z6.formatGen(formatByCode('post_udar')!, 'post_tg'), 'post_tg')
  assert.equal(Z6.zh6Prompt(ctxP(PERSONAS.H), { topic: 'т', format: 'stories' } as any).format6.for[0], 'stories')
  assert.equal(Z6.formatGen(formatByCode('reels_scenka_vnutr_golos')!, 'reels_monolog'), 'reels_scenka')
  assert.equal(Z6.formatGen(formatByCode('reels_bez_slov')!, 'reels_monolog'), 'reels_bez_slov')
  assert.equal(Z6.formatGen(formatByCode('reels_golova')!, 'reels_monolog'), 'reels_monolog')
  const bezVideo = { ...PERSONAS.I, video_attitude: 'Пока без видео' }
  assert.ok(!formatyAvtora(ctxP(bezVideo).settings).some(f => Z6.vKadre(f)), 'без видео нет форматов в кадре')
  assert.ok(formatyAvtora(ctxP(bezVideo).settings).some(f => f.code === 'reels_bez_slov'), 'беззвучный рилс остается')
  assert.ok(!Z6.vKadre(Z6.zh6Prompt(ctxP(bezVideo), { topic: 'т', format: 'reels_monolog' } as any).format6), 'рилс без видео выбран беззвучным')
  assert.equal(Z6.zh6Prompt(ctxP(PERSONAS.I), { topic: 'т', format: 'post', formatKod: 'reels_scenka_vnutr_golos' } as any).format6.for[0], 'post', 'формат из плана другого типа не берется')
  assert.equal(Z6.matZvezdy({ ...ctxP(PERSONAS.I).settings, matZvezdyVybor: false }), false)
  assert.equal(Z6.matZvezdy(ctxP({ ...PERSONAS.I, profanity: 'light' }).settings), true, '«Иногда, со звездочкой»')
  assert.equal(Z6.matZvezdy(ctxP(PERSONAS.I).settings), false, 'по образцам без звездочек')
  assert.ok(ctxP({ ...PERSONAS.I, habits: { kodovoe_slovo: 'ЗЛОСТЬ' } }).settings.kodovoeSlovo === 'ЗЛОСТЬ')
  console.log('ok 11: сторис и Telegram, виды рилсов, видео, мат по выбору, формат из плана по типу, кодовое слово из профиля')
  {
    // 12: вид у каждого формата набора свой (экран «Сделать», zh6.vidy)
    const v = vidyFrom({ vidy: { reels: 'reels_scenka_ya_psiholog', carousel: 'carousel_spisok_priznakov', post: 'post_direkt', stories: 'post_udar' } }, ['reels', 'carousel', 'post', 'stories'])
    assert.deepEqual(v, { reels: 'reels_scenka_ya_psiholog', carousel: 'carousel_spisok_priznakov', post: 'post_direkt' }, 'три вида сохраняются, чужой тип у сторис выкинут')
    assert.deepEqual(vidyFrom({ vidy: { reels: 'carousel_odna_mysl', post: 'net_takogo' } }, ['reels', 'post']), {}, 'вид другого типа и выдуманный код не берем')
    assert.deepEqual(vidyFrom({ vidy: { carousel: 'carousel_obzor' } }, ['reels']), {}, 'вид формата, который не отмечен, не берем')
    assert.deepEqual(vidyFrom({ formatKod: 'reels_bez_slov', forFormat: 'reels' }, ['reels', 'post']), { reels: 'reels_bez_slov' }, 'старое поле formatKod понимаем')
    assert.deepEqual(vidyFrom({ vidy: { post_tg: 'post_spor' } }, ['post_tg']), { post_tg: 'post_spor' }, 'Telegram берет виды поста')
    assert.deepEqual(vidyFrom(null, ['reels']), {})
    // без zh6 каталога нет: экран выбора не показывает, сервер vidy не читает (zh6On ложь)
    const s = readFileSync(join(__dirname, '..', 'app', 'api', 'generate-post', 'group', 'route.ts'), 'utf8')
    assert.ok(/const vidy[^\n]*= zb \? vidyFrom\(zb, formats\) : \{\}/.test(s) && /const zb = zh6 &&/.test(s), 'group читает vidy только при zh6')
    assert.ok(/const avtora = formatyAvtora\(ctx\.settings\)/.test(s) && /avtora\.includes\(kod\)/.test(s) && /formatKody = iz/.test(s) && /vidZamenen/.test(s), 'вид не под голос: подберу сама и честная пометка')
    const c = readFileSync(join(__dirname, '..', 'components', 'make', 'Composer.tsx'), 'utf8')
    assert.ok(!/для одного формата/.test(c), 'строки «один формат за раз» больше нет')
    // карточки видов: каждый вид каталога (рилс, карусель, пост) ровно в одной карточке своего типа, у карточки тексты,
    // у подвидов карточки с несколькими видами имена; тексты без ё, тире и женского рода о психологе
    const kart = readFileSync(join(__dirname, '..', 'components', 'make', 'vid-cards.ts'), 'utf8')
    for (const f of FORMATY.filter(x => ['reels', 'carousel', 'post'].includes(x.for[0]))) {
      const tip = f.for[0] as 'reels' | 'carousel' | 'post'
      const v = GRUPPY[tip].filter(g => g.codes.includes(f.code))
      assert.equal(v.length, 1, `вид ${f.code} ровно в одной карточке ${tip}`)
      if (v[0].codes.length > 1) assert.ok(kart.includes(`${f.code}: ['`), `имя подвида ${f.code}`)
    }
    for (const tip of ['reels', 'carousel', 'post'] as const) for (const g of GRUPPY[tip]) for (const c of g.codes) assert.ok(formatByCode(c)?.for[0] === tip, `${c} есть в каталоге и тип ${tip}`)
    assert.ok(!/[ёЁ—]/.test(kart), 'тексты карточек без ё и тире')
    assert.ok(!/(?<![\p{L}])(сама|готова|сняла|сделала|играешь ты сама)(?![\p{L}])/u.test(kart), 'нейтральный род в карточках')
    assert.deepEqual(grupyFrom({ grupy: { reels: 'scenka', carousel: 'net', post_tg: 'spor' } }, ['reels', 'carousel', 'post_tg']), { reels: GRUPPY.reels[1].codes, post_tg: ['post_spor'] }, 'карточка без подвида: ее виды, чужая карточка выкинута')
  }
  console.log('ok 12: вид у каждого формата набора свой, чужие и выдуманные коды выкидываются, карточки видов покрывают каталог')

  // 13. пометка собирательной истории кодом: только у трех видов, только в подпись, один раз
  {
    const rils = 'Текст на экране: Психолог: Что вы чувствуете?\n[смена]\nКлиентка: Ничего.\n\nПодпись: Иногда «ничего» это очень много.'
    const r1 = sobiratelnaya(rils, 'reels_kabinet')
    assert.ok(r1.endsWith(`Иногда «ничего» это очень много.\n${SOBIR_LINE}`), 'строка в конце подписи рилса')
    assert.equal(splitCaption(r1).body, splitCaption(rils).body, 'надпись на экране не тронута')
    assert.ok(splitCaption(r1).caption.endsWith(SOBIR_LINE), 'строка в описании к публикации')
    assert.equal(sobiratelnaya(r1, 'reels_kabinet'), r1, 'второй раз не дописывается')
    const scenka = 'Текст на экране: Первая встреча\nРечь:\nКлиентка: Да у меня все нормально.\nПсихолог: А что тогда привело?'
    const r2 = sobiratelnaya(scenka, 'reels_scenka_pervaya_sessiya')
    assert.ok(r2.endsWith(`\n\nПодпись: ${SOBIR_LINE}`) && splitCaption(r2).body === scenka, 'рилс без подписи: подпись из одной строки, речь не тронута')
    const post = 'Клиентка села и спросила: «А можно сегодня не про маму?»\n\nЯ кивнула.'
    assert.equal(sobiratelnaya(post, 'post_kabinet'), `${post}\n\n${SOBIR_LINE}`, 'пост: последней строкой')
    for (const kod of ['reels_bez_slov', 'post_udar', 'reels_scenka_vnutr_golos', null, undefined]) assert.equal(sobiratelnaya(rils, kod as any), rils, `у ${kod} без пометки`)
    for (const kod of SOBIR_VIDY) assert.ok(formatByCode(kod), `вид ${kod} есть в каталоге`)
    assert.ok(!/[ёЁ—]/.test(SOBIR_LINE) && !priemyOf(SOBIR_LINE).length, 'строка без ё и тире и не ловится как прием')
    // у двух материалов набора одна и та же строка: проверка набора не считает ее повтором соседа
    const iss = checkSet([{ format: 'post', text: sobiratelnaya(post, 'post_kabinet') }, { format: 'reels_monolog', text: r1 }], '')
    assert.ok(!iss.some(i => i.phrases.some(ph => ph.includes('собирательная'))), 'пометка не уходит на перепись как повтор')
    // не задваивается, если модель в «Поправить» чуть изменила строку (ревью 11.11)
    const count = (s: string) => (s.match(/собирательн/giu) || []).length
    for (const v of ['История собирательная, совпадения случайны', 'история собирательная, совпадения случайны!', 'История собирательная.', 'История собирательная, все совпадения случайны.']) {
      const x = sobiratelnaya(r1.replace(SOBIR_LINE, v), 'reels_kabinet')
      assert.equal(count(x), 1, `одна строка после правки: ${v}`)
      assert.equal(x, r1, `та же подпись после правки: ${v}`)
    }
    const p2 = sobiratelnaya(`${post}\n\nИстория собирательная, совпадения случайны`, 'post_kabinet')
    assert.equal(p2, `${post}\n\n${SOBIR_LINE}`, 'пост: строка без точки заменяется своей')
    // фраза автора со словами «история собирательная» внутри текста не вырезается (ревью 11.11)
    for (const body of ['Это история собирательного образа, а не одной клиентки. Дальше текст.', 'Моя история собирательная по сути. Дальше.']) {
      assert.equal(sobiratelnaya(body, 'post_kabinet'), `${body}\n\n${SOBIR_LINE}`, `тело не тронуто: ${body}`)
    }
    assert.equal(sobiratelnaya(SOBIR_LINE, 'post_kabinet'), SOBIR_LINE, 'текст из одной строки не становится пустым')
    // не пропадает после проверки набора: в group/route.ts дописывание после rewritePhrases и stripAds, до сохранения
    const gr = readFileSync(join(__dirname, '..', 'app', 'api', 'generate-post', 'group', 'route.ts'), 'utf8')
    const iSob = gr.indexOf('sobiratelnaya(item.text')
    assert.ok(iSob > gr.lastIndexOf('rewritePhrases(') && iSob > gr.lastIndexOf('stripAds(') && iSob < gr.indexOf('savePost(db'), 'в наборе строка возвращается после переписки и до сохранения')
    // без строки после переписки она дописывается снова
    assert.equal(sobiratelnaya(rils, 'reels_kabinet'), r1, 'потерянная строка возвращается')
  }
  console.log('ok 13: пометка «История собирательная» дописывается кодом в подпись только у кабинета, сессии и первой встречи')
  {
    // 14: надпись на экране обрубками (11.11)
    const ob = (t: string) => zh6Mesta(t, { sources: [], allowMat: true }).filter(x => x.code === 'nadpis_obrubki')
    const bad = 'Текст на экране: Вы отказали. Мама уже плохая мать.\nРечь: Вы сказали маме «нет», и через час она уже звонит тете.\nПодпись: Про отказы.'
    const f = ob(bad)
    assert.equal(f.length, 1, 'обрубки не пойманы')
    assert.equal(f[0].quote, 'Вы отказали. Мама уже плохая мать.', 'место это сама надпись, без метки')
    assert.ok(f[0].why && !/[ёЁ—–]/.test(f[0].why), 'причина для правки без ё и тире')
    const ok = [
      'Текст на экране: «Успокойся». Охуенный способ помочь.',
      'Текст на экране: Я только спрошу, где он. В пятый раз.',
      'Текст на экране: Ты отправила подруге фото готовой работы и получила: «Как же круто получилось!»',
      'Текст на экране: Мама снова звонит в восемь утра, чтобы узнать, почему ты не приедешь.',
      'Ты отказала маме. Она обиделась. Ты извинилась. Опять.',
      'Текст на экране: Психолог: Что вы чувствуете?\nНичего.\n[смена]\nУстала.',
    ]
    for (const t of ok) assert.equal(ob(t).length, 0, `ложная находка: ${t}`)
    // продолжение надписи на следующей строке до метки тоже в счет
    assert.equal(nadpisObrubki('Текст на экране: Сказала нет.\nМама в слезах.\nРечь: дальше речь').length, 1, 'строка-продолжение')
    // правило надписи одно: в разметке говорящих рилсов и в карточке, без старых «до 8/10 слов» и «резкое утверждение»
    const rilsy = FORMATY.filter(x => x.for[0] === 'reels' && !['reels_bez_slov', 'reels_kabinet', 'reels_ispoved'].includes(x.code))
    for (const x of rilsy) {
      const b = formatBlock(x)
      assert.ok(b.includes(NADPIS), `правило надписи в ${x.code}`)
      assert.ok(!/(?:Надпись|надпись)[^\n.]{0,30}до \d+ слов|до [78] слов\n/u.test(b) && !/резкое утверждение, до/u.test(b), `старый предел надписи в ${x.code}`)
    }
    assert.ok(FORMAT_CARDS.reels.includes(NADPIS) && !/до 10 слов/.test(FORMAT_CARDS.reels), 'карточка рилса с тем же правилом')
    assert.ok(!/[ёЁ—–]/.test(NADPIS))
    // банк живых примеров: сколько надписей поймалось бы (для глаза, это не ошибка)
    const bank = PRIMERY.filter(p => nadpisObrubki(p.text).length)
    if (bank.length) console.log('  обрубки в банке примеров (для глаза):', bank.map(p => p.id).join(', '))
    // находка уходит на ту же правку мест: писатель дал обрубки, правка дала целое предложение
    const sent13: any[] = []
    const r13 = [
      'Текст на экране: Вы отказали. Мама уже плохая мать.\nРечь: Вы сказали маме, что не приедете, и через час она уже звонит тете и жалуется.\nПодпись: Про отказы.',
      'Текст на экране: Вы сказали маме «нет», и она уже жалуется тете на плохую дочь.\nРечь: Вы сказали маме, что не приедете, и через час она уже звонит тете и жалуется.\nПодпись: Про отказы.',
    ]
    ;(globalThis as any).fetch = async (_u: string, init: any) => {
      sent13.push(JSON.parse(init.body))
      const content = r13[Math.min(sent13.length - 1, r13.length - 1)]
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200 })
    }
    const w13: any = await simpleWrite(ctxOf(PERSONAS.H, []), { topic: 'отказ маме', format: 'reels_monolog', intent: 'uznavanie' } as any)
    assert.equal(sent13.length, 2, 'писатель и правка мест')
    assert.ok(/Вы отказали\. Мама уже плохая мать/.test(sent13[1].messages[1].content), 'надпись названа в местах правки')
    assert.ok(w13.zh6.pravka && w13.zh6.mesta.some((m: any) => m.code === 'nadpis_obrubki') && !w13.zh6.ostalos.some((m: any) => m.code === 'nadpis_obrubki'), 'правка надписи не взята')
    // беззвучные рилсы (ревью 11.11): короткие строки надписи у исповеди и беззвучного без [смена] это устройство вида, не обрубки
    const ispoved = 'Текст на экране: Я опять сорвалась.\nКрикнула на сына.\nПотом плакала в ванной.\nУтром извинилась.\nИ снова.\nПодпись: Знакомо.'
    const bezSlov = 'Текст на экране: Он не ответил. Я уже все решила.\nПодпись: Знакомо.'
    for (const t of [ispoved, bezSlov]) {
      assert.equal(ob(t).length, 1, 'сама строка без вида ловится, иначе тест ничего не проверяет')
      assert.ok(!zh6Mesta(t, { sources: [], allowMat: true, nadpis: false }).some(x => x.code === 'nadpis_obrubki'), 'nadpis: false выключает находку')
    }
    for (const [kod, t] of [['reels_ispoved', ispoved], ['reels_bez_slov', bezSlov]] as const) {
      ;(globalThis as any).fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: t } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200 })
      const w: any = await simpleWrite(ctxOf(PERSONAS.H, []), { topic: 'срываюсь на сына', format: 'reels_monolog', intent: 'uznavanie', formatKod: kod } as any)
      assert.ok(!w.zh6.mesta.some((m: any) => m.code === 'nadpis_obrubki'), `${kod}: надпись не уходит на правку`)
    }
  }
  console.log('ok 14: надпись обрубками ловится, цитата в кавычках, длинная фраза, пост и сцены сменами не ловятся, правило надписи одно')
}
main().then(() => console.log('zh6: все тесты прошли')).catch(e => { console.error(e); process.exit(1) })
