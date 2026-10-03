// Прогон Reels (6 видов) и постов на НАСТОЯЩЕЙ модели, версия 3.5 (живые ролики в П2).
// Это настоящие деньги: около 350 ₽ за весь прогон. Без --yes только печатает оценку.
//
// Запуск в Терминале из папки проекта (нужен OPENAI_API_KEY в .env.local):
//   npx tsx --env-file=.env.local scripts/reels-test.ts --yes
//   npx tsx --env-file=.env.local scripts/reels-test.ts --yes --only=3,7     (выборочно)
//   ... --writer=gpt-5.6-terra   текст пишет другая модель (план и проверка на обычной), папка reels-v35-<модель>
//   ... --model=gpt-5.6-terra    вся цепочка на другой модели
// Результаты: _знания/мозг-генератора/test/reels-v35[-модель]/ (по файлу на материал и общий ВСЕ.md)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildAuthorSettings } from '../lib/generation/settings'
import { modelFor } from '../lib/generation/ai'
import { draft, refine, buildVoiceCore, type GenContext, type GenRequest } from '../lib/generation/pipeline'
import { extractOpening, type FormatCode } from '../lib/generation/text-guard'
import type { Memory } from '../lib/generation/memory'

const ROOT = join(__dirname, '..', '_знания', 'мозг-генератора', 'test')
const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || ''
if (flag('model')) process.env.GENERATION_MODEL = flag('model')
if (flag('writer')) process.env.GENERATION_WRITER_MODEL = flag('writer')
const SUFFIX = flag('model') || flag('writer')
const OUT = join(ROOT, SUFFIX ? `reels-v35-${SUFFIX}` : 'reels-v35')

const PERSONAS: Record<'A' | 'B' | 'C', any> = {
  A: {
    full_name: 'Юлия', author_gender: 'female', reader_address: 'ty', profanity: 'no', disclosure: 2,
    approaches: ['Психоанализ'], one_niche: 'одиночество и отношения у женщин 30-45', audience: 'в основном женщины 30-45',
    client_pain_phrases: '«я вроде все делаю правильно, а рядом никого»; «опять выбрала того, кто не выбирает меня»; «с ним скучно, а без него страшно»; «мне тридцать восемь, и я все еще жду, что мама скажет, что я молодец»',
    position_text: 'Злит, когда психологи обещают, что после терапии вы станете счастливыми. Терапия про то, чтобы жить свою жизнь, а не про счастье по заказу.',
    story_bank: [{ text: 'Когда я сама первый раз пришла в анализ, я два месяца рассказывала аналитику, как у меня все хорошо. Потом он спросил, зачем я тогда плачу в машине перед каждой сессией.', level: 'work' }],
  },
  B: {
    full_name: 'Ольга', author_gender: 'female', reader_address: 'vy_devochki', profanity: 'free', intensity: 'hot', disclosure: 1,
    approaches: ['Системная семейная терапия'], one_niche: 'мамы, уставшие от быта и мужа', audience: 'в основном женщины, мамы 28-45',
    client_pain_phrases: '«я одна тащу весь дом»; «он говорит: ну скажи, что сделать, я сделаю»; «я кричу на детей, а потом ненавижу себя»; «хочу просто полежать, чтобы никто ничего не хотел»',
    position_text: 'Бесят советы «а ты попроси мужа помочь». Он не помогает, он там живет.',
    story_bank: [{ text: 'Однажды я на детском празднике поймала себя на том, что считаю, сколько раз муж посмотрел в телефон. Одиннадцать. Я психолог, у меня супервизия, а я сижу и считаю.', level: 'personal' }],
    booking_info: 'пишите в директ слово «разбор»',
  },
  C: {
    full_name: 'Михаил', author_gender: 'male', reader_address: 'vy', profanity: 'no', disclosure: 3,
    approaches: ['КПТ'], one_niche: 'тревога, неуверенность, отношения', audience: 'мужчины и женщины 25-45',
    client_pain_phrases: '«я все время думаю, что обо мне подумают»; «не могу отказать, потом злюсь на себя»; «жду, когда станет не страшно, и тогда начну»',
    position_text: 'Не люблю, когда самооценку лечат аффирмациями у зеркала. Уверенность появляется от поступков, а не от слов.',
    story_bank: [],
  },
}

const MATRIX: { n: number; who: 'A' | 'B' | 'C'; intent: string; format: FormatCode; topic: string }[] = [
  { n: 1, who: 'A', intent: 'podderzhka', format: 'reels_auto', topic: 'выходные в одиночестве' },
  { n: 2, who: 'A', intent: 'kak_v_terapii', format: 'reels_scenka', topic: 'первые месяцы терапии, когда «все хорошо»' },
  { n: 3, who: 'B', intent: 'yumor', format: 'reels_rol', topic: 'муж «помогает» по дому' },
  { n: 4, who: 'B', intent: 'uznavanie', format: 'reels_spisok', topic: 'мама кричит на детей, а потом себя ненавидит' },
  { n: 5, who: 'B', intent: 'yumor', format: 'reels_bez_slov', topic: 'хочу просто полежать, чтобы никто ничего не хотел' },
  { n: 6, who: 'C', intent: 'mif', format: 'reels_monolog', topic: '«уверенность надо в себе воспитать»' },
  { n: 7, who: 'C', intent: 'mehanizm', format: 'reels_doska', topic: 'почему трудно отказать' },
  { n: 8, who: 'A', intent: 'uznavanie', format: 'reels_monolog', topic: 'опять выбрала того, кто не выбирает меня' },
  { n: 9, who: 'B', intent: 'podderzhka', format: 'post', topic: 'крикнула на ребенка и ненавижу себя' },
  { n: 10, who: 'C', intent: 'mehanizm', format: 'post_tg', topic: 'жду, когда станет не страшно, и тогда начну' },
  { n: 11, who: 'A', intent: 'uznavanie', format: 'post', topic: 'с ним скучно, а без него страшно' },
  { n: 12, who: 'C', intent: 'dlya_blizkih', format: 'carousel', topic: 'тревожный близкий' },
  { n: 13, who: 'B', intent: 'razreshenie', format: 'carousel', topic: 'можно не быть веселой мамой' },
  { n: 14, who: 'C', intent: 'kak_v_terapii', format: 'reels_otvet', topic: '«а если психолог мне не поможет?»' },
  { n: 15, who: 'A', intent: 'svoya_istoriya', format: 'reels_istoriya', topic: 'как я сама пришла в анализ и говорила, что все хорошо' },
  { n: 16, who: 'B', intent: 'podderzhka', format: 'reels_poslanie', topic: 'мама, которая вечером считает, что опять ничего не успела' },
]

function samplesOf(who: string): string[] {
  const md = readFileSync(join(ROOT, 'samples', `${who}_obrazcy.md`), 'utf8')
  return md.split(/^## Образец \d+\s*$/m).slice(1).map(s => s.trim()).filter(Boolean)
}

const emptyMemory = (): Memory => ({ count: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [] })

async function main() {
  const args = process.argv.slice(2)
  const only = (args.find(a => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean).map(Number)
  const rows = only.length ? MATRIX.filter(r => only.includes(r.n)) : MATRIX
  console.log(`Модель: план и проверка ${modelFor(false)}, текст ${modelFor(true)}.`)
  console.log(`Материалов: ${rows.length}. Оценка: около ${Math.ceil(rows.length * 25 + 30)} ₽ (5-7 вызовов на материал, плюс слепки голоса, если их еще нет).`)
  if (!args.includes('--yes')) { console.log('Это настоящие деньги. Запусти с --yes, если согласна.'); return }
  if (!process.env.OPENAI_API_KEY) throw new Error('Нет OPENAI_API_KEY в .env.local')
  mkdirSync(OUT, { recursive: true })

  const memories: Record<string, Memory> = { A: emptyMemory(), B: emptyMemory(), C: emptyMemory() }
  const cores: Record<string, { core: string; sig: string[]; fit: (boolean | null)[]; samples: string[] }> = {}
  const summary: string[] = ['# Прогон Reels и постов, версия 3.5', `Модель: план и проверка ${modelFor(false)}, текст ${modelFor(true)}`, '']

  for (const row of rows) {
    const p = PERSONAS[row.who]
    if (!cores[row.who]) {
      const coreJson = join(OUT, `voice_core_${row.who}.json`)
      if (existsSync(coreJson)) cores[row.who] = JSON.parse(readFileSync(coreJson, 'utf8'))
      else {
        console.log(`слепок голоса ${row.who}...`)
        const r = await buildVoiceCore('', samplesOf(row.who), [p.full_name])
        cores[row.who] = { core: r.voiceCore, sig: r.signatures, fit: r.fit, samples: r.cleaned }
        writeFileSync(coreJson, JSON.stringify(cores[row.who]))
      }
    }
    const c = cores[row.who]
    const profile = { ...p, voice_core: c.core, signature_phrases: c.sig, voice_samples: c.samples.map((text, i) => ({ text, fit: c.fit[i], source: 'pasted' })) }
    const ctx: GenContext = { userId: '', settings: buildAuthorSettings(profile, { rotation: memories[row.who].count }), memory: memories[row.who] }
    const req: GenRequest = { topic: row.topic, format: row.format, intent: row.intent }

    const t0 = Date.now()
    let d = await draft(ctx, req)
    if (d.kind === 'need_detail') d = await draft(ctx, req, { plan: d.plan, skipDetail: true })
    if (d.kind !== 'text') continue
    const r = await refine(ctx, d.plan, req, d.text, d.findings)
    const sec = Math.round((Date.now() - t0) / 1000)

    const m = memories[row.who]
    m.count++
    if (d.plan.hook_type) m.lastHookTypes.unshift(d.plan.hook_type)
    if (d.plan.arc) m.lastArcs.unshift(d.plan.arc)
    m.lastOpenings.unshift(extractOpening(r.text, req.format))
    if (d.plan.ending_type) m.lastEndings.unshift(d.plan.ending_type)
    m.lastRings.unshift(d.plan.ring === true)
    m.lastIntents.unshift(d.plan.intent)
    m.lastFormats.unshift(req.format)
    if (d.plan.detail) m.usedDetails.unshift(d.plan.detail)
    m.recentTopics.unshift(d.plan.topic_for_text)

    const head = `## ${row.n}. ${row.who} (${p.full_name}), ${row.intent}, ${row.format === 'reels_auto' ? `reels_auto → ${req.format}` : req.format}: ${row.topic}`
    const meta = `${sec} с, правок ${r.fixes}, переписан: ${r.rewritten ? 'да' : 'нет'}, проверка: ${r.review.severity}`
    const problems = r.review.checks.filter(x => x.problem).map(x => `${x.id}: ${x.issue || ''}`).join('; ')
    writeFileSync(join(OUT, `${String(row.n).padStart(2, '0')}_${row.who}_${req.format}.md`), [
      head, meta, '\n### Итог\n', r.text, '\n### Черновик до проверки\n', d.text,
      '\n### Проверка\n', '```json\n' + JSON.stringify(r.review, null, 2) + '\n```',
      '\n### План\n', '```json\n' + JSON.stringify(d.plan, null, 2) + '\n```',
    ].join('\n'))
    summary.push(head, meta, problems ? `Замечания проверки: ${problems}` : '', '', r.text, '', '---', '')
    writeFileSync(join(OUT, 'ВСЕ.md'), summary.join('\n'))
    console.log(`${row.n}: ${req.format}, ${meta}`)
  }
  console.log(`Готово. Файлы в ${OUT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
