// Настройки психолога для новой цепочки: из профиля (onboarding_profiles) в плейсхолдеры промптов.
// Новые поля профиля (миграция 20260930120000_generation_brain.sql) необязательны: пока их нет,
// работают разумные умолчания из старых полей.

import { buildBaseSettings } from './prompts'

export type StoryLevel = 'personal' | 'work' | 'practice'
export type Story = { text: string; level: StoryLevel }
export type VoiceSample = { text: string; fit?: boolean | null; note?: string; source?: string }

export type AuthorSettings = {
  baseSettings: string
  genderForms: string
  address: string
  profanityRule: string
  readerGenderRule: string
  disclosure: 1 | 2 | 3
  voiceCore: string
  voiceCoreShort: string
  hasVoiceCore: boolean
  samples: string[]           // годные образцы, из них П2 берет до трех
  signatures: string[]
  position: string
  stories: Story[]
  clientPhrases: string
  knownNames: string[]
  // для конца описания под рилсом и каруселью: кто я и как ко мне попасть
  name: string
  niche: string
  booking: string
}

const arr = (v: unknown): string => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v ? String(v) : '')
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s)

// Пол автора: новое поле author_gender, иначе по имени (окончание на а/я), иначе женский.
function genderOf(profile: any): 'female' | 'male' {
  if (profile.author_gender === 'male' || profile.author_gender === 'female') return profile.author_gender
  const first = String(profile.full_name || '').trim().split(/\s+/)[0] || ''
  if (!first) return 'female'
  const exceptionsMale = ['Илья', 'Никита', 'Кузьма', 'Фома', 'Савва', 'Лука', 'Муса', 'Иса']
  if (exceptionsMale.includes(first)) return 'male'
  return /[аяАЯ]$/.test(first) ? 'female' : 'male'
}

// Обращение к читателю: новое поле reader_address, иначе по старому полю appeal.
// appeal в онбординге это «как к вам обращаются клиенты»: «На «ты» по имени» / «По имени-отчеству» / «По имени».
function addressOf(profile: any): string {
  switch (profile.reader_address) {
    case 'ty': return 'на ты'
    case 'vy': return 'на вы'
    case 'vy_devochki': return 'на вы, иногда девочки'
  }
  const a = String(profile.appeal || '')
  if (/«ты»|на ты/i.test(a)) return 'на ты'
  if (/отчеств/i.test(a)) return 'на вы'
  return 'как в образцах автора; если по образцам не видно, на ты'
}

function disclosureOf(profile: any): 1 | 2 | 3 {
  const d = Number(profile.disclosure)
  return d === 1 || d === 3 ? d : 2
}

const DISCLOSURE_TEXT: Record<1 | 2 | 3, string> = {
  1: 'открыто: можно писать о своей жизни, семье, прошлом, но только из банка историй',
  2: 'о работе и профессии: обучение, закулисье, почему в профессии; о семье и личном нет',
  3: 'только практика: о себе почти ничего, опора на опыт работы без подробностей',
}

const ALLOWED_LEVELS: Record<1 | 2 | 3, StoryLevel[]> = {
  1: ['personal', 'work', 'practice'],
  2: ['work', 'practice'],
  3: ['practice'],
}

// Пункты 3, 4, 7 и 11 слепка, до 800 символов (для П1 и П6).
export function voiceCoreShortOf(core: string): string {
  if (!core) return ''
  const lines = core.split('\n')
  const keep = new Set(['3', '4', '7', '11'])
  const out: string[] = []
  let on = false
  for (const l of lines) {
    const m = l.match(/^\s*(\d{1,2})[.)]\s/)
    if (m) on = keep.has(m[1])
    if (on) out.push(l)
  }
  const text = out.join('\n').trim() || core
  return clip(text, 800)
}

// Фирменные обороты из пункта 11 слепка: всё, что в кавычках.
export function parseSignatures(core: string): string[] {
  const block = pointBlock(core, '11')
  const found = [...block.matchAll(/[«"“]([^»"”]{3,60})[»"”]/g)].map(m => m[1].trim())
  return Array.from(new Set(found)).filter(s => s.split(/\s+/).length >= 2).slice(0, 6)
}

// Годность образцов из пункта 13: «Образец N: годится / не годится ...».
export function parseSampleFit(core: string, n: number): (boolean | null)[] {
  const res: (boolean | null)[] = Array.from({ length: n }, () => null)
  const block = pointBlock(core, '13') || core
  for (const m of block.matchAll(/Образец\s+(\d+)\s*:\s*(не\s+годится|годится)/gi)) {
    const i = Number(m[1]) - 1
    if (i >= 0 && i < n) res[i] = !/^не/i.test(m[2])
  }
  return res
}

function pointBlock(core: string, num: string): string {
  const lines = core.split('\n')
  const out: string[] = []
  let on = false
  for (const l of lines) {
    const m = l.match(/^\s*(\d{1,2})[.)]\s/)
    if (m) on = m[1] === num
    if (on) out.push(l)
  }
  return out.join('\n')
}

// Три самых разных образца: короткий, длинный и средний; сдвиг по счетчику, чтобы чередовать.
export function pickSamples(samples: string[], rotation = 0): string[] {
  if (samples.length <= 3) return samples
  const sorted = [...samples].sort((a, b) => a.length - b.length)
  const n = sorted.length
  const idx = [0, Math.floor(n / 2), n - 1].map(i => (i + rotation) % n)
  return Array.from(new Set(idx)).map(i => sorted[i])
}

export function buildAuthorSettings(profile: any, opts?: { rotation?: number }): AuthorSettings {
  const gender = genderOf(profile)
  const disclosure = disclosureOf(profile)
  const audience = String(profile.audience || '').trim() || clip(String(profile.client_avatar || '').trim(), 160)
  const womenAudience = /женщин|девушк|мам/i.test(audience) && !/мужчин|парн|пар[аы]/i.test(audience)
  const profanity = profile.profanity === 'free'
    ? 'свободно, как автор говорит в жизни; в Instagram со звездочкой в середине слова, в Telegram как у автора в образцах'
    : profile.profanity === 'light' ? 'точечно, цензура как у автора в образцах' : 'нет'
  const emotion = ({
    calm: 'спокойно и ровно: без восклицаний и резких слов',
    live: 'живо, как в разговоре: разговорные словечки, изредка восклицание',
    hot: 'на эмоциях: можно резко, с иронией, одно слово капсом на материал',
  } as Record<string, string>)[String(profile.intensity || '')] || ''
  const address = addressOf(profile)
  const genderForms = gender === 'female' ? 'женском роде' : 'мужском роде'

  const approach = arr(profile.approaches)
  const niche = String(profile.one_niche || '').trim() ? clip(String(profile.one_niche), 200) : arr(profile.niches)

  const baseSettings = buildBaseSettings({
    gender_word: gender === 'female' ? 'психолог-женщина' : 'психолог-мужчина',
    gender_forms: genderForms,
    address,
    audience,
    profanity,
    emotion,
    disclosure_text: DISCLOSURE_TEXT[disclosure],
    approach: approach || 'не указан',
    niche: niche || 'не указана',
    booking: profile.booking_info,
    first_session: profile.first_session_info,
    character: profile.character_text,
  })

  // Слепок: если еще не собран, честно говорим об этом и даем то, что автор сказал о себе.
  const core = String(profile.voice_core || '').trim()
  const fallbackCore = [
    'Слепок голоса еще не собран, образцов мало. Что известно о манере автора:',
    profile.tone_verbal ? `Как автор сам описывает свою манеру: ${clip(String(profile.tone_verbal), 600)}` : '',
    profile.idols ? `На кого похож по манере, по словам автора: ${clip(String(profile.idols), 200)}` : '',
  ].filter(Boolean).join('\n')
  const corrections = String(profile.voice_corrections || '').trim()
  const voiceCore = (core || fallbackCore) + (corrections ? `\n\nАвтор сама уточнила про свой голос: ${clip(corrections, 600)}` : '')

  // Образцы: годные из voice_samples; если их нет, live_voice как один образец.
  const stored: VoiceSample[] = Array.isArray(profile.voice_samples) ? profile.voice_samples : []
  // Ее собственные тексты вперед; правленый пост (смесь ее и нашего) не больше одного из трех.
  const good = stored.filter(s => s && s.text && s.fit !== false)
  const own = good.filter(s => s.source !== 'edited').map(s => String(s.text))
  const edited = good.filter(s => s.source === 'edited').map(s => String(s.text)).slice(0, 1)
  let samples = pickSamples(own.map(s => clip(s, 900)), opts?.rotation || 0)
  if (samples.length < 3 && edited.length) samples = [...samples, clip(edited[0], 900)]
  if (!samples.length && profile.live_voice) samples = [clip(String(profile.live_voice), 900)]

  const signatures: string[] = Array.isArray(profile.signature_phrases) ? profile.signature_phrases.filter(Boolean) : []

  const position = String(profile.position_text || '').trim() || [
    arr(profile.anti_values) ? `Что бесит: ${arr(profile.anti_values)}` : '',
    profile.anti_values_custom ? String(profile.anti_values_custom) : '',
  ].filter(Boolean).join('. ')

  const storiesAll: Story[] = Array.isArray(profile.story_bank) ? profile.story_bank.filter((s: any) => s && s.text) : []
  const stories = storiesAll.filter(s => ALLOWED_LEVELS[disclosure].includes(s.level || 'practice'))

  return {
    baseSettings,
    genderForms,
    address,
    profanityRule: profanity === 'нет' ? 'не использовать' : profile.profanity === 'free' ? 'автор матерится как в жизни, поэтому в материале мат обязательно есть, один-три раза, там где так сказали бы вслух: злость, шутка, облегчение, усталость; это короткая вспышка внутри живой фразы в момент, где правда бесит, своими словами под ситуацию, а не мат, пришитый к длинному аккуратному риторическому вопросу посреди объяснения; в речи рилса и в репликах слово целиком, как его произносят; в надписи на экране, описании, постах и слайдах для Instagram со звездочкой в середине слова' : 'можно точечно, там где автор злится или шутит, цензура как у автора',
    readerGenderRule: womenAudience ? 'о читательнице в женском роде' : 'без родовых окончаний',
    disclosure,
    voiceCore,
    voiceCoreShort: voiceCoreShortOf(voiceCore),
    hasVoiceCore: !!core,
    samples,
    signatures,
    position: clip(position, 800),
    stories,
    clientPhrases: String(profile.client_pain_phrases || '').trim(),
    knownNames: profile.full_name ? [String(profile.full_name)] : [],
    name: String(profile.full_name || '').trim().split(/\s+/)[0] || '',
    niche,
    booking: String(profile.booking_info || '').trim(),
  }
}

// До трех историй, подходящих к теме (совпадение слов), или все, если их мало.
export function relevantStories(stories: Story[], topic: string): Story[] {
  if (stories.length <= 3) return stories
  const words = new Set(topic.toLowerCase().split(/[^\p{L}]+/u).filter(w => w.length > 3).map(w => w.slice(0, 5)))
  const scored = stories.map(s => ({
    s,
    score: s.text.toLowerCase().split(/[^\p{L}]+/u).filter(w => w.length > 3 && words.has(w.slice(0, 5))).length,
  }))
  return scored.sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.s)
}

const LEVEL_WORD: Record<StoryLevel, string> = { personal: 'личное', work: 'про работу', practice: 'практика' }
export function storiesText(stories: Story[]): string {
  return stories.map((s, i) => `История ${i + 1} (${LEVEL_WORD[s.level] || 'практика'}): ${s.text}`).join('\n')
}
