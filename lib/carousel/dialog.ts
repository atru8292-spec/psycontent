// Карусель «Диалог»: на слайде реплики двух людей и они сами, нарисованные от руки.
// А это клиент (слева), Б это психолог (справа). Текст слайда: строки «А: …» и «Б: …»
// (можно в одну строку через « / »), по желанию поза в скобках: «А (злится): …».
// Человечки: Open Peeps (Pablo Stanley, CC0), лежат в public/carousel/peeps, лицензия там же в README.
// Линии перекрашиваются в цвет текста палитры, заливка в цвет фона, поэтому человечки подходят к любому стилю.
// Модель картинок не рисует: позу выбирает код по словам реплики или П7 полем pose (только имя из списка).

import fs from 'fs'
import path from 'path'

export type Who = 'a' | 'b'
export type Reply = { who: Who; text: string; pose?: Pose }
export const POSES = ['sidit', 'dumaet', 'trevozhitsya', 'razvodit_rukami', 'chitaet', 'ulybaetsya', 'grustit', 'obyasnyaet', 'zlitsya', 'somnevaetsya'] as const
export type Pose = typeof POSES[number]
export const isPose = (v: unknown): v is Pose => typeof v === 'string' && (POSES as readonly string[]).includes(v)

// подписи поз по-русски: для П7 и для явной позы в тексте «А (думает): …»
export const POSE_RU: Record<Pose, string> = {
  sidit: 'сидит', dumaet: 'думает', trevozhitsya: 'тревожится', razvodit_rukami: 'разводит руками', chitaet: 'читает',
  ulybaetsya: 'улыбается', grustit: 'грустит', obyasnyaet: 'объясняет', zlitsya: 'злится', somnevaetsya: 'сомневается',
}
const RU_TO_POSE: [RegExp, Pose][] = [
  [/сид/i, 'sidit'], [/дума/i, 'dumaet'], [/трев|боит|пуга/i, 'trevozhitsya'], [/развод|руками/i, 'razvodit_rukami'],
  [/чита|телефон/i, 'chitaet'], [/улыб|смеет|рад/i, 'ulybaetsya'], [/грус|плач/i, 'grustit'], [/объясн|рассказ/i, 'obyasnyaet'],
  [/зли|серд/i, 'zlitsya'], [/сомнев|не уверен/i, 'somnevaetsya'],
]

// ---------- разбор ----------
// «А:», «Б:», «Клиент:», «Психолог:», «К:», «П:», латинские A/B тоже (модель путает раскладку)
const SPEAKER = /^\s*(а|a|б|b|клиент(?:ка)?|психолог|к|п)\s*(?:\(([^)]{1,30})\))?\s*[:：]\s*/i
const whoOf = (s: string): Who => (/^(а|a|клиент|к)/i.test(s) ? 'a' : 'b')

export function parseDialog(text: string): Reply[] | null {
  // « / » между репликами в одной строке = перенос
  const lines = String(text || '').split(/\n|\s\/\s(?=\s*(?:а|a|б|b|клиент|психолог|к|п)\s*(?:\([^)]*\))?\s*:)/i).map(l => l.trim()).filter(Boolean)
  const out: Reply[] = []
  for (const l of lines) {
    const m = l.match(SPEAKER)
    if (m) {
      const ru = m[2]?.trim()
      const pose = ru ? RU_TO_POSE.find(([re]) => re.test(ru))?.[1] : undefined
      out.push({ who: whoOf(m[1]), text: l.slice(m[0].length).trim(), ...(pose ? { pose } : {}) })
    } else if (out.length) {
      out[out.length - 1].text = `${out[out.length - 1].text} ${l}`.trim()
    } else return null // текст до первой реплики: это не диалог
  }
  // одна реплика тоже диалог (после «Разделить на два слайда»), но только с явной меткой А/Б, не с «К:»/«П:»
  if (!out.length || !out.every(r => r.text)) return null
  if (out.length === 1 && /^\s*(к|п)\s*[(:：]/i.test(lines[0])) return null
  return out
}
export const isDialogText = (text: string) => !!parseDialog(text)
// реплики обратно в текст слайда (правка на превью, «Слайд N: А: … / Б: …»)
export const dialogToText = (rs: Reply[]) => rs.map(r => `${r.who === 'a' ? 'А' : 'Б'}${r.pose ? ` (${POSE_RU[r.pose]})` : ''}: ${r.text}`).join('\n')

// ---------- поза по словам реплики ----------
// Порядок важен: злость и тревога сильнее вопроса, вопрос сильнее улыбки.
const KEYS: [RegExp, Pose][] = [
  [/бесит|злю|злит|злость|раздраж|достал|ненавиж|сколько можно|орать|ору(?![а-яё])/i, 'zlitsya'],
  [/страшно|боюсь|тревож|паник|а вдруг|волнуюсь|не сплю|сердце колотит/i, 'trevozhitsya'],
  [/плач|грустн|одинок|пусто|больно|тоскл|устала|устал(?![а-яё])|сил нет|не хочется ничего/i, 'grustit'],
  [/не знаю|наверное|может быть|вряд ли|не уверен|сомнева|как будто/i, 'somnevaetsya'],
  [/и что теперь|что делать|почему|как так|ну и что|не понимаю|а что/i, 'razvodit_rukami'],
  [/читаю|прочитал|написал|сообщени|переписк|телефон|книг/i, 'chitaet'],
  [/для начала|попробуй|давай|смотри|представь|когда мы|это нормально|у многих/i, 'obyasnyaet'],
  [/хм|подумать|думаю|вспомни|интересно|задумал/i, 'dumaet'],
  [/смешно|ха-ха|рада|рад(?![а-яё])|легче|получилось|спасибо|здорово|ура/i, 'ulybaetsya'],
]
export function poseFor(text: string, who: Who, speaking: boolean, n = 0): Pose {
  if (!speaking) return 'sidit'
  for (const [re, p] of KEYS) if (re.test(text)) return p
  // по умолчанию психолог объясняет, улыбается или думает (по очереди от слайда к слайду, чтобы не стоять одинаково),
  // клиент спрашивает или рассказывает
  if (who === 'b') return (['obyasnyaet', 'ulybaetsya', 'dumaet'] as const)[n % 3]
  return /\?\s*$/.test(text) ? 'razvodit_rukami' : 'sidit'
}
// Позы на слайд: говорящий по своей последней реплике, молчащий слушает.
// Явная поза (в тексте или от П7) сильнее слов.
export function slidePoses(rs: Reply[], given?: { a?: unknown; b?: unknown } | null, n = 0): { a: Pose; b: Pose } {
  const pick = (who: Who): Pose => {
    const g = given?.[who]
    if (isPose(g)) return g
    const mine = rs.filter(r => r.who === who)
    const last = mine[mine.length - 1]
    if (!last) return poseFor('', who, false)
    return last.pose || poseFor(last.text, who, true, n)
  }
  return { a: pick('a'), b: pick('b') }
}

// ---------- картинка человечка ----------
const DIR = path.join(process.cwd(), 'public', 'carousel', 'peeps')
const raw = new Map<string, string>()
const urls = new Map<string, string>()
export const PEEP_W = 1170, PEEP_H = 1280
// SVG человечка: линии в цвет ink, заливка в цвет paper. Рисунки смотрят вправо: клиент слева как есть,
// психолога справа отражаем вокруг середины поля (x = 425), чтобы двое смотрели друг на друга
export function peepUrl(who: Who, pose: Pose, ink: string, paper: string): string {
  const key = `${who}|${pose}|${ink}|${paper}`
  const hit = urls.get(key)
  if (hit) return hit
  const file = `${who === 'a' ? 'klient' : 'psy'}_${pose}.svg`
  let svg = raw.get(file)
  if (svg === undefined) { svg = fs.readFileSync(path.join(DIR, file), 'utf8'); raw.set(file, svg) }
  let s = svg.replace(/#222222/gi, ink).replace(/#ffffff/gi, paper)
  if (who === 'b') s = s.replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>)\s*$/, '$1<g transform="translate(850 0) scale(-1 1)">$2</g>$3')
  const url = `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
  if (urls.size > 200) urls.clear()
  urls.set(key, url)
  return url
}
