// Прогон новой цепочки на НАСТОЯЩЕЙ модели: 3 тестовых психолога и 12 материалов
// из _знания/мозг-генератора/test/PERSONY.md. Это настоящие деньги: около 300-400 ₽ за весь прогон.
// Без флага --yes только печатает оценку и выходит.
//
// Запуск (нужен OPENAI_API_KEY в .env.local):
//   npx tsx --env-file=.env.local scripts/real-test.ts --yes
//   npx tsx --env-file=.env.local scripts/real-test.ts --yes --only=3,7,10     (выборочно)
// Результаты: _знания/мозг-генератора/test/real-api/

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildAuthorSettings } from '../lib/generation/settings'
import { draft, refine, buildVoiceCore, type GenContext, type GenRequest } from '../lib/generation/pipeline'
import { extractOpening } from '../lib/generation/text-guard'
import type { Memory } from '../lib/generation/memory'

const ROOT = join(__dirname, '..', '_знания', 'мозг-генератора', 'test')
const OUT = join(ROOT, 'real-api')

const PERSONAS: Record<'A' | 'B' | 'C', any> = {
  A: {
    full_name: 'Юлия', author_gender: 'female', reader_address: 'ty', profanity: 'no', disclosure: 2,
    approaches: ['Психоанализ'], one_niche: 'одиночество и отношения у женщин 30-45', audience: 'в основном женщины 30-45',
    client_pain_phrases: '«я вроде все делаю правильно, а рядом никого»; «опять выбрала того, кто не выбирает меня»; «с ним скучно, а без него страшно»; «мне тридцать восемь, и я все еще жду, что мама скажет, что я молодец»',
    position_text: 'Злит, когда психологи обещают, что после терапии вы станете счастливыми. Терапия про то, чтобы жить свою жизнь, а не про счастье по заказу.',
    story_bank: [{ text: 'Когда я сама первый раз пришла в анализ, я два месяца рассказывала аналитику, как у меня все хорошо. Потом он спросил, зачем я тогда плачу в машине перед каждой сессией.', level: 'work' }],
  },
  B: {
    full_name: 'Ольга', author_gender: 'female', reader_address: 'vy_devochki', profanity: 'light', disclosure: 1,
    approaches: ['Системная семейная терапия'], one_niche: 'мамы, уставшие от быта и мужа', audience: 'в основном женщины, мамы 28-45',
    client_pain_phrases: '«я одна тащу весь дом»; «он говорит: ну скажи, что сделать, я сделаю»; «я кричу на детей, а потом ненавижу себя»; «хочу просто полежать, чтобы никто ничего не хотел»',
    position_text: 'Бесят советы «а ты попроси мужа помочь». Он не помогает, он там живет.',
    story_bank: [{ text: 'Однажды я на детском празднике поймала себя на том, что считаю, сколько раз муж посмотрел в телефон. Одиннадцать. Я психолог, у меня супервизия, а я сижу и считаю.', level: 'personal' }],
    booking_info: '[добавь: как записаться]',
  },
  C: {
    full_name: 'Михаил', author_gender: 'male', reader_address: 'vy', profanity: 'no', disclosure: 3,
    approaches: ['КПТ'], one_niche: 'тревога, неуверенность, отношения', audience: 'мужчины и женщины 25-45',
    client_pain_phrases: '«я все время думаю, что обо мне подумают»; «не могу отказать, потом злюсь на себя»; «жду, когда станет не страшно, и тогда начну»',
    position_text: 'Не люблю, когда самооценку лечат аффирмациями у зеркала. Уверенность появляется от поступков, а не от слов.',
    story_bank: [],
  },
}

const MATRIX: { n: number; who: 'A' | 'B' | 'C'; intent: string; format: GenRequest['format']; topic: string }[] = [
  { n: 1, who: 'A', intent: 'uznavanie', format: 'carousel', topic: 'одиночество в отношениях' },
  { n: 2, who: 'A', intent: 'kak_v_terapii', format: 'reels_scenka', topic: 'первые месяцы терапии, когда «все хорошо»' },
  { n: 3, who: 'A', intent: 'podderzhka', format: 'post', topic: 'выходные в одиночестве' },
  { n: 4, who: 'A', intent: 'poziciya', format: 'post', topic: 'терапия не делает счастливой' },
  { n: 5, who: 'B', intent: 'yumor', format: 'reels_scenka', topic: 'муж «помогает»' },
  { n: 6, who: 'B', intent: 'svoya_istoriya', format: 'post', topic: 'контроль в браке' },
  { n: 7, who: 'B', intent: 'razreshenie', format: 'carousel', topic: 'можно не быть веселой мамой' },
  { n: 8, who: 'B', intent: 'priglashenie', format: 'post', topic: 'консультации для уставших мам' },
  { n: 9, who: 'C', intent: 'mif', format: 'reels_monolog', topic: '«уверенность надо в себе воспитать»' },
  { n: 10, who: 'C', intent: 'mehanizm', format: 'post', topic: 'почему трудно отказать' },
  { n: 11, who: 'C', intent: 'dlya_blizkih', format: 'carousel', topic: 'тревожный близкий' },
  { n: 12, who: 'C', intent: 'svoya_istoriya', format: 'post', topic: 'как я сам боялся выступать' },
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
  console.log(`Материалов: ${rows.length}. Оценка: около ${Math.ceil(rows.length * 28 + 25)} ₽ (gpt-5.4, 5-7 вызовов на материал, плюс слепки голоса).`)
  if (!args.includes('--yes')) { console.log('Это настоящие деньги. Запусти с --yes, если согласна.'); return }
  if (!process.env.OPENAI_API_KEY) throw new Error('Нет OPENAI_API_KEY')
  mkdirSync(OUT, { recursive: true })

  const memories: Record<string, Memory> = { A: emptyMemory(), B: emptyMemory(), C: emptyMemory() }
  const cores: Record<string, { core: string; sig: string[]; fit: (boolean | null)[]; samples: string[] }> = {}

  for (const row of rows) {
    const p = PERSONAS[row.who]
    if (!cores[row.who]) {
      const coreFile = join(OUT, `voice_core_${row.who}.md`)
      const raw = samplesOf(row.who)
      if (existsSync(coreFile)) {
        const saved = JSON.parse(readFileSync(coreFile.replace('.md', '.json'), 'utf8'))
        cores[row.who] = saved
      } else {
        const t = Date.now()
        const r = await buildVoiceCore('', raw, [p.full_name])
        cores[row.who] = { core: r.voiceCore, sig: r.signatures, fit: r.fit, samples: r.cleaned }
        writeFileSync(coreFile, `# Слепок ${row.who} (${Math.round((Date.now() - t) / 1000)} с)\n\n${r.voiceCore}\n\nОбороты: ${r.signatures.join(' | ')}\nГодность: ${JSON.stringify(r.fit)}\n`)
        writeFileSync(coreFile.replace('.md', '.json'), JSON.stringify(cores[row.who]))
      }
    }
    const c = cores[row.who]
    const profile = { ...p, voice_core: c.core, signature_phrases: c.sig, voice_samples: c.samples.map((text, i) => ({ text, fit: c.fit[i], source: 'pasted' })) }
    const ctx: GenContext = { userId: '', settings: buildAuthorSettings(profile, { rotation: memories[row.who].count }), memory: memories[row.who] }
    const req: GenRequest = { topic: row.topic, format: row.format, intent: row.intent }

    const t0 = Date.now()
    let d = await draft(ctx, req)
    let question = ''
    if (d.kind === 'need_detail') {
      question = d.question
      d = await draft(ctx, req, { plan: d.plan, skipDetail: true })
    }
    if (d.kind !== 'text') continue
    const tDraft = Date.now() - t0
    const r = await refine(ctx, d.plan, req, d.text, d.findings)
    const tAll = Date.now() - t0

    const m = memories[row.who]
    m.count++
    if (d.plan.hook_type) m.lastHookTypes.unshift(d.plan.hook_type)
    if (d.plan.arc) m.lastArcs.unshift(d.plan.arc)
    m.lastOpenings.unshift(extractOpening(r.text, row.format))
    if (d.plan.ending_type) m.lastEndings.unshift(d.plan.ending_type)
    m.lastRings.unshift(d.plan.ring === true)
    m.lastIntents.unshift(d.plan.intent)
    if (d.plan.detail) m.usedDetails.unshift(d.plan.detail)
    m.recentTopics.unshift(d.plan.topic_for_text)

    const file = join(OUT, `${String(row.n).padStart(2, '0')}_${row.who}_${row.intent}_${row.format}.md`)
    writeFileSync(file, [
      `# ${row.n}. ${row.who}, ${row.intent}, ${row.format}: ${row.topic}`,
      `Время: текст через ${Math.round(tDraft / 1000)} с, итог через ${Math.round(tAll / 1000)} с. Правок: ${r.fixes}. Переписан заново: ${r.rewritten ? 'да' : 'нет'}. Серьезность проверки: ${r.review.severity}.`,
      question ? `\nВопрос психологу (пропущен): ${question}` : '',
      '\n## Итог\n', r.text,
      '\n## Черновик до проверки\n', d.text,
      '\n## Проверка\n', '```json\n' + JSON.stringify(r.review, null, 2) + '\n```',
      '\n## План\n', '```json\n' + JSON.stringify(d.plan, null, 2) + '\n```',
    ].join('\n'))
    console.log(`${row.n}: ${Math.round(tDraft / 1000)} с / ${Math.round(tAll / 1000)} с, ${r.review.severity}, правок ${r.fixes}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
