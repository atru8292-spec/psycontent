// zh6-prod: снимок промптов старого генератора (zh+h7, как в проде) без модели и сети. Заглушка fetch записывает каждый
// вызов (system, user, параметры). Три задания: рилс, пост, карусель, плюс настройки автора без новых полей zh6.
//   OPENAI_API_KEY=test-bez-seti npx tsx scripts/zh6/snimok-zhh7.ts --write   записать снимок (на чистом main)
//   OPENAI_API_KEY=test-bez-seti npx tsx scripts/zh6/snimok-zhh7.ts           сравнить с записанным
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { simpleWrite } from '../../lib/generation/simple'
import { buildAuthorSettings } from '../../lib/generation/settings'

const FILE = join(__dirname, '..', 'fixtures', 'snimok-zhh7-main.json')
const PROFILE = {
  full_name: 'Ольга', author_gender: 'female', reader_address: 'vy', profanity: 'free', intensity: 'hot', disclosure: 1,
  approaches: ['Системная семейная терапия'], one_niche: 'мамы, уставшие от быта и мужа', audience: 'в основном женщины, мамы 28-45',
  client_pain_phrases: '«я одна тащу весь дом»; «я кричу на детей, а потом ненавижу себя»',
  position_text: 'Бесят советы «а ты попроси мужа помочь».', booking_info: 'пишите в директ слово «разбор»', video_attitude: 'Пока без видео',
  voice_core: '', voice_samples: [{ text: 'Я три года тащила все сама и не понимала, почему так устаю. Потом поняла, что меня никто не просил, я сама вызывалась. Смешно, да?', fit: true, source: 'pasted' }],
}
const mem = () => ({ count: 3, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: ['mehanizm'], lastFormats: ['post'], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: ['усталость'], feedbackReasons: [] })
const ZADANIYA = [
  { topic: 'мама кричит на детей и потом ненавидит себя', format: 'reels_monolog', intent: 'mehanizm' },
  { topic: 'муж «помогает», а дом все равно на вас', format: 'post', intent: 'uznavanie' },
  { topic: 'усталость, которую никто не замечает', format: 'carousel', intent: 'podderzhka' },
]

async function main() {
  delete process.env.PROMPT_HYP
  const calls: any[] = []
  ;(globalThis as any).fetch = async (_u: string, init: any) => {
    const b = JSON.parse(init.body)
    calls.push({ model: b.model, effort: b.reasoning_effort, verbosity: b.verbosity, max: b.max_completion_tokens, system: b.messages[0].content, user: b.messages[1].content })
    const sys = String(b.messages[0].content)
    const content = b.response_format ? '{"cut":[]}' : /карусел/i.test(sys + b.messages[1].content) ? 'Слайд 1: Текст\nСлайд 2: Еще\nПодпись: Подпись.' : 'Текст на экране: Надпись\nРечь: Речь ролика про усталость.\nПодпись: Подпись.'
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 })
  }
  const settings: any = buildAuthorSettings(PROFILE, { rotation: 1 })
  // новые поля zh6 в настройках старый генератор не читает, в снимок они не входят
  for (const k of ['approach', 'blogAbout', 'snimaetVideo', 'matZvezdyVybor', 'kodovoeSlovo']) delete settings[k]
  const out: any = { settings, zadaniya: [] }
  for (const z of ZADANIYA) {
    calls.length = 0
    const r = await simpleWrite({ userId: '', settings: buildAuthorSettings(PROFILE, { rotation: 1 }), memory: mem() } as any, z as any)
    out.zadaniya.push({ z, calls: [...calls], text: r.text })
  }
  if (process.argv.includes('--write')) { writeFileSync(FILE, JSON.stringify(out, null, 1)); console.log(`записан снимок: ${out.zadaniya.map((x: any) => x.calls.length).join(', ')} вызовов`); return }
  if (!existsSync(FILE)) throw new Error('нет снимка')
  const was = JSON.parse(readFileSync(FILE, 'utf8'))
  const a = JSON.stringify(was), b = JSON.stringify(out)
  if (a !== b) {
    for (let i = 0; i < was.zadaniya.length; i++) if (JSON.stringify(was.zadaniya[i]) !== JSON.stringify(out.zadaniya[i])) console.log(`различие в задании ${i + 1}`)
    if (JSON.stringify(was.settings) !== JSON.stringify(out.settings)) console.log('различие в настройках')
    throw new Error('zh+h7 НЕ как в main')
  }
  console.log(`ok: zh+h7 побайтно как в main (${out.zadaniya.length} задания, ${out.zadaniya.map((x: any) => x.calls.length).join(' + ')} вызовов, настройки те же)`)
}
main().catch(e => { console.error(e); process.exit(1) })
