// Гипотезы для слепого сравнения вариантов простого пути (задача _знания/мозг-генератора/test/PROMPT-CLAUDE-CODE-gipotezy.md).
// Включаются переменной окружения PROMPT_HYP, можно несколько через запятую: PROMPT_HYP=h2,h4.
// Без переменной (или h0) генерация ровно как раньше. Основной промпт ПП в 03-PROMPTY.md не трогаем,
// пока гипотеза не победила: варианты собираются здесь поверх него.
//   h1  речь, а не пост: длинные цепочки фраз, мало кавычек, без двоеточий, больше «я»
//   h2  живые примеры целиком, подобранные по голосу автора (банк voice-bank.json)
//   h3  короткий промпт вместо ПП
//   h4  неидеальность вместо правила про реакцию автора
//   h5  модель без рассуждения, temperature 1.0
//   h6  длина рилса как у целых живых транскриптов того же вида (медиана × 1.15), «60-75 секунд»
//   h7  наговорить и вырезать: речь вдвое длиннее потолка h6, потом ножницы режут целые фразы до потолка (до половины)
//   h8  неочевидная сцена: про себя пять сцен, берется не первая; начало не обязано быть цитатой
//   zh  новый промпт «ПЖ. Простой путь от живого» (03-PROMPTY.md)

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { isReels, type FormatCode } from './text-guard'

export type Hyp = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'h7' | 'h8' | 'zh'

// По умолчанию (переменная пустая) zh+h7: этот вариант Арина в слепом чтении оценила выше живых текстов (релиз 2026-10).
// PROMPT_HYP=h0 (или none) вернет базовый ПП без гипотез, любой другой список включает ровно его.
export const DEFAULT_HYPS: Hyp[] = ['zh', 'h7']
export function activeHyps(): Set<Hyp> {
  const raw = String(process.env.PROMPT_HYP || '').trim().toLowerCase()
  if (!raw) return new Set(DEFAULT_HYPS)
  if (raw === 'h0' || raw === 'none') return new Set()
  return new Set(raw.split(/[\s,+]+/).filter((h): h is Hyp => /^(h[1-8]|zh)$/.test(h)))
}

// ---------- h3: короткий промпт ----------
export const H3_SYSTEM = `Ты психолог и ведешь блог. Напиши один материал для своих подписчиков так, как сказал бы это вслух человеку напротив: своими словами, с характером автора.

Ради чего это читают: человек узнает себя («это прям я») и понимает про себя новое («блин, реально, а я столько лет не понимала, что это»). Поэтому одна мысль, которую он раньше не слышал от психологов, на ситуации, которую узнает почти каждый из аудитории.

Живые ролики ниже показывают, как звучат психологи, которых досматривают и пересылают. Бери манеру, а темы и фразы свои. Из текстов автора бери его словечки и температуру, из материала автора что-то одно, если подходит к теме. Факты о жизни автора только из его материала.

Первая строка сразу называет ситуацию, ее не надо разгадывать. Говори уверенно, без оговорок в каждой мысли. В конце простая фраза, которая договаривает мысль, или вопрос, который переворачивает взгляд, или ирония про себя, или один простой шаг, если без него непонятно, что теперь делать.

Нельзя:
- выдумывать клиентов, случаи, цифры, исследования;
- ставить читателю диагноз и обещать результат;
- «не X, а Y» в любой форме и «за этим стоит»;
- кальки и книжные фразы, которые никто не скажет вслух;
- упражнение с наблюдением за собой в конце («Сегодня попробуйте... и посмотрите, что будет»), мораль, афоризм под занавес;
- тире и букву «ё».

Верни только материал в формате из блока «формат», без пояснений.`

// ---------- h1: речь, а не пост ----------
const H1_REELS = `Это расшифровка ролика, который психолог записывает одним дублем, без бумажки. Говори так, как говорят вслух: фразы разной длины, длинные цепочки через «и», «а», «потому что», «и вроде... но», перечисления через запятую, и между ними вдруг короткая фраза. Мысли человека пересказывай своими словами, кавычек не больше одной на весь текст. Двоеточий в речи нет (метки формата оставь). Говори от себя, «я»: что ты думаешь, что тебя бесит, что ты видишь у себя или вокруг, без выдуманных фактов биографии. Это важнее того, что выше сказано про мысли читателя в кавычках.`
const H1_POST = `Это пост человека, который пишет быстро и для своих, почти как говорит. Фразы разной длины: длинные цепочки через «и», «а», «потому что», перечисления через запятую, и между ними короткие. Мысли человека чаще пересказывай своими словами, кавычек не больше двух на весь текст. Двоеточий в тексте почти нет (метки формата оставь). Говори от себя, «я»: что ты думаешь, что тебя бесит, что ты видишь у себя или вокруг, без выдуманных фактов биографии. Это важнее того, что выше сказано про мысли читателя в кавычках.`

// ---------- h4: неидеальность ----------
const H4_TEXT = `Живой текст неидеальный, и в этом его прелесть. У живых психологов реакция вплетена в речь и сразу переходит в мысль («Давайте так, мы никого не притягиваем, мы просто живем свою жизнь»). Проверка: если реакцию можно вычеркнуть и соседняя фраза не заметит потери, это вставка, так не надо. Одну-две вещи на текст скажи и не объясняй: резкое утверждение, перескок на свою мысль, возврат к уже сказанному. Можно сбиться и вернуться, повторить слово, начать фразу одним способом и закончить другим. Первая фраза и общая мысль при этом понятны с первого раза.`
// абзац ПП про реакцию автора, который h4 заменяет
const REACTION_RE = /В живых роликах слышно, как сам автор реагирует[^\n]*?выдает шаблон\./u

export function hypSystem(base: string, format: FormatCode, hyps: Set<Hyp>): string {
  let sys = hyps.has('h3') ? H3_SYSTEM : base
  if (hyps.has('h4')) {
    if (REACTION_RE.test(sys)) sys = sys.replace(REACTION_RE, H4_TEXT)
    else sys = sys.replace(/\n\nНельзя:/u, `\n\n${H4_TEXT}\n\nНельзя:`)
  }
  if (hyps.has('h1')) sys += `\n\n${isReels(format) ? H1_REELS : H1_POST}`
  if (hyps.has('h8')) sys += `\n\n${H8_TEXT}`
  return sys
}

// ---------- h5: выборка ----------
export function hypCall(hyps: Set<Hyp>): { effort?: 'none'; temperature?: number } {
  return hyps.has('h5') ? { effort: 'none', temperature: 1 } : {}
}

// ---------- h2: живые примеры по голосу ----------
export type VoiceText = { id: string; source: 'reels' | 'tg'; kind: string; voice: string[]; words: number; text: string }

let bank: VoiceText[] | null = null
export function voiceBank(): VoiceText[] {
  if (bank) return bank
  const f = join(process.cwd(), 'lib', 'generation', 'voice-bank.json')
  bank = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []
  // ролики про боль психологов-блогеров не образец (CLAUDE.md, РАЗНЫЕ ПРИЧИНЫ ВЫБОРА)
  bank = bank!.filter(t => !['r03', 'r33', 'r40', 'r62', 'r65'].includes(t.id) && !t.id.startsWith('psikhologd'))
  return bank
}

// Какие виды текста ближе к формату: сначала свой, потом соседние.
const KINDS: Record<string, string[]> = {
  reels_spisok: ['spisok', 'monolog'],
  reels_scenka: ['scenka', 'rol', 'monolog'],
  reels_rol: ['rol', 'scenka', 'monolog'],
  reels_istoriya: ['istoriya', 'monolog'],
  carousel: ['spisok', 'obyasnenie', 'post'],
  post: ['post', 'monolog', 'obyasnenie'],
  post_tg: ['post', 'monolog', 'obyasnenie'],
}

// 3-4 живых текста под голос автора: с матом, если автор матерится; по температуре (спокойно, на эмоциях);
// разные по виду и источнику; по кругу от материала к материалу.
export function pickVoiceExamples(format: FormatCode, o: { allowMat: boolean; hot: boolean; calm: boolean; rotation: number }): VoiceText[] {
  const all = voiceBank().filter(t => t.words >= 40 && t.words <= 380 && (o.allowMat || !t.voice.includes('mat')))
  if (!all.length) return []
  const kinds = KINDS[format] || ['monolog', 'obyasnenie', 'spisok']
  const want = o.allowMat ? ['mat', 'emocii', 'rezko', 'ironiya'] : o.hot ? ['emocii', 'ironiya', 'rezko'] : o.calm ? ['spokoyno', 'ironiya'] : ['ironiya', 'spokoyno', 'emocii']
  const score = (t: VoiceText) => {
    const k = kinds.indexOf(t.kind)
    return (k === -1 ? 0 : 3 - k) + t.voice.filter(v => want.includes(v)).length * 2 + (o.allowMat && t.voice.includes('mat') ? 3 : 0)
  }
  const ranked = [...all].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
  // верхняя часть списка, сдвиг по кругу, чтобы примеры менялись
  const top = ranked.slice(0, Math.min(ranked.length, 14))
  const k = o.rotation % top.length
  const rotated = [...top.slice(k), ...top.slice(0, k)]
  const out: VoiceText[] = []
  let words = 0
  for (const t of rotated) {
    if (out.length >= 4 || words + t.words > 1100) continue
    // не больше двух одного вида, чтобы манера была разной
    if (out.filter(x => x.kind === t.kind).length >= 2) continue
    out.push(t)
    words += t.words
  }
  return out
}

export function voiceExamplesText(list: VoiceText[]): string {
  return 'Так звучит живая речь психологов. Возьми манеру, не слова и не темы.\n\n' +
    list.map((t, i) => `<пример ${i + 1} ${t.source === 'tg' ? 'пост в Telegram' : 'ролик'}>\n${t.text}\n</пример ${i + 1}>`).join('\n\n')
}

// ---------- h8: неочевидная сцена ----------
const H8_TEXT = `Перед тем как писать, про себя выпиши пять сцен из жизни этой аудитории по этой теме. Первая, что пришла в голову, есть у всех, ее не бери. И самую очевидную тоже. Возьми ту, которую люди узнают сразу, но редко называют вслух. Эти пять сцен в ответ не пиши. Начинать не обязательно с цитаты: живые психологи начинают и с мнения, и с вопроса к зрителю, и с обращения, и с истории про себя.`

// ---------- h6, h7: длина рилса по целым живым транскриптам ----------
const REELS_KINDS: Record<string, string[]> = {
  reels_spisok: ['spisok'], reels_scenka: ['scenka'], reels_rol: ['rol'], reels_istoriya: ['istoriya', 'monolog'],
}
// медиана длины целых живых транскриптов того же вида × 1.15, до десятков; банк live-bank.json, пока его нет voice-bank.json
export function liveReelsMaxWords(format: FormatCode): number {
  const f = ['live-bank.json', 'voice-bank.json'].map(x => join(process.cwd(), 'lib', 'generation', x)).find(existsSync)
  const bankAll: { source: string; kind: string; words: number; id: string }[] = f ? JSON.parse(readFileSync(f, 'utf8')) : []
  const kinds = REELS_KINDS[format] || ['monolog', 'obyasnenie', 'otvet']
  let lens = bankAll.filter(t => t.source === 'reels' && kinds.includes(t.kind) && !['r03', 'r33', 'r62', 'r65'].includes(t.id)).map(t => t.words)
  if (lens.length < 3) lens = bankAll.filter(t => t.source === 'reels').map(t => t.words)
  lens.sort((a, b) => a - b)
  if (!lens.length) return 190
  return Math.round((lens[Math.floor(lens.length / 2)] * 1.15) / 10) * 10
}

// правило рилса для h6 и h7: длиннее и дольше по времени
export function hypReelsRule(rule: string, hyps: Set<Hyp>, maxWords: number): string {
  if (!hyps.has('h6') && !hyps.has('h7') && !hyps.has('zh')) return rule
  let r = rule.replace(/за 30-45 секунд/u, 'за 60-75 секунд')
  if (hyps.has('h7')) {
    r = r.replace(/Речь без надписи и подписи не длиннее \d+ слов[^.]*\./u,
      `Сейчас наговори речь длиннее обычного, около ${maxWords * 2} слов: как человек говорит в камеру одним дублем, с отступлением в сторону, возвратом к мысли, примером из жизни и своим отношением, сказанным каждый раз по-разному. Потом лишние целые фразы вырежут, поэтому не сжимай.`)
    r = r.replace(/Перед ответом посчитай слова речи[^.]*\./u, '')
  }
  return r
}

export const H7_CUT_SYSTEM = `Ты монтажер рилсов психолога. Тебе дают расшифровку дубля, она длиннее, чем нужно. Вырежи целые фразы так, чтобы речь стала не длиннее нужного числа слов. Внутри фраз ничего не меняй, ничего не переписывай и не добавляй.

Режь в первую очередь повторы мысли, объяснения того, что пример уже показал, общие фразы, утешение и мораль ближе к концу. Оставь первую фразу, живые сцены, свое мнение автора, резкость, мат, шутки, отступление, если оно живое, и последнюю сильную фразу. Проверь, что соседние фразы после вырезания читаются подряд. Если вырезаешь предложение, у которого есть короткая дописка отдельной фразой (одно-три слова, продолжение той же мысли), вырежи и ее, иначе она останется обрывком.

Выписывай каждую фразу целиком и точно, буква в букву как в тексте. Метки формата («Речь:», «Подпись:» и другие) в фразу не включай. Подпись не трогай.

Ответ только JSON: {"cut": ["фраза", "фраза"]}`

// ---------- zh: живые примеры из live-bank.json ----------
// sub у каруселей: nabor, perevod, golos_iznutri, odna_mysl, obzor, dialog, prodayushaya (11-KAK-USTROENY-KARUSELI.md)
export type LiveText = { id: string; source: 'reels' | 'tg' | 'karusel'; kind: string; sub?: string; voice: string[]; words: number; text: string; ai_like?: string }
let liveBankCache: LiveText[] | null = null
export function liveBank(): LiveText[] {
  if (liveBankCache) return liveBankCache
  const f = join(process.cwd(), 'lib', 'generation', 'live-bank.json')
  liveBankCache = (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) as LiveText[] : [])
    .filter(t => !t.ai_like && !['r03', 'r33', 'r40', 'r62', 'r65'].includes(t.id) && !t.id.startsWith('psikhologd'))
  return liveBankCache
}

// какие виды живых ближе к формату
const ZH_KINDS: Record<string, string[]> = {
  reels_monolog: ['monolog', 'obyasnenie', 'otvet'], reels_otvet: ['otvet', 'monolog', 'obyasnenie'],
  reels_poslanie: ['monolog', 'otvet'], reels_istoriya: ['istoriya', 'monolog'],
  reels_spisok: ['spisok', 'monolog'], reels_scenka: ['scenka', 'rol'], reels_rol: ['rol', 'scenka'],
  post: ['tg_post', 'monolog', 'istoriya', 'otvet'], post_tg: ['tg_post', 'otvet', 'monolog'], carousel: ['karusel', 'spisok', 'obyasnenie'],
}
const authorOf = (id: string) => (id.includes('#') ? id.split('#')[0] : id)

// 3-4 живых текста: свой вид первым, голос автора (с матом только у автора с матом; спокойным спокойные и теплые),
// не больше двух одного автора или канала, по кругу от материала к материалу.
export function pickLiveExamples(format: FormatCode, o: { allowMat: boolean; hot: boolean; calm: boolean; rotation: number; max?: number }): LiveText[] {
  if (format === 'carousel') return pickLiveCarousels(o)
  const kinds = ZH_KINDS[format] || ['monolog', 'obyasnenie']
  const want = o.allowMat ? ['mat', 'emocii', 'rezko', 'ironiya'] : o.hot ? ['emocii', 'ironiya', 'rezko'] : o.calm ? ['spokoyno', 'teplo'] : ['spokoyno', 'teplo', 'ironiya']
  // автор без мата не получает ни мата, ни Прокопову (ее голос узнаваем и без мата, Арина 02.10)
  const pool = liveBank().filter(t => t.words >= 40 && t.words <= (t.kind === 'karusel' ? 700 : 420) && (o.allowMat || (!t.voice.includes('mat') && !t.id.startsWith('olga_prokopova'))))
  const score = (t: LiveText) => {
    const k = kinds.indexOf(t.kind)
    return (k === -1 ? 0 : 6 - k * 2) + t.voice.filter(v => want.includes(v)).length * 2 - (!o.allowMat && !o.hot && t.voice.includes('rezko') ? 5 : 0)
  }
  const ranked = [...pool].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).slice(0, 16)
  const k = o.rotation % (ranked.length || 1)
  const rotated = [...ranked.slice(k), ...ranked.slice(0, k)]
  const out: LiveText[] = []
  let words = 0
  for (const t of rotated) {
    if (out.length >= (o.max || 4) || words + t.words > 1400) continue
    if (out.filter(x => authorOf(x.id) === authorOf(t.id)).length >= 2) continue
    if (out.filter(x => x.kind === t.kind).length >= 2 && out.length < 3 && rotated.some(r => !out.includes(r) && r.kind !== t.kind && kinds.includes(r.kind))) continue
    out.push(t)
    words += t.words
  }
  return out
}

// Карусели: только живые карусели, три разных вида (набор, перевод, обзор...), чтобы модель видела, что вид выбирают
// под тему, и не брала один за эталон. Голос автора важнее: спокойному спокойные и теплые, резкому ироничные.
// По кругу от материала к материалу, по одной карусели автора.
function pickLiveCarousels(o: { allowMat: boolean; hot: boolean; calm: boolean; rotation: number; max?: number }): LiveText[] {
  const want = o.allowMat || o.hot ? ['ironiya', 'rezko', 'emocii'] : o.calm ? ['spokoyno', 'teplo'] : ['teplo', 'ironiya', 'spokoyno']
  const pool = liveBank().filter(t => t.kind === 'karusel' && t.words <= 750 && (o.allowMat || !t.voice.includes('mat')))
  const ranked = [...pool].sort((a, b) => b.voice.filter(v => want.includes(v)).length - a.voice.filter(v => want.includes(v)).length || a.id.localeCompare(b.id))
  const k = o.rotation % (ranked.length || 1)
  const rotated = [...ranked.slice(k), ...ranked.slice(0, k)]
  const out: LiveText[] = []
  let words = 0
  for (const t of rotated) {
    if (out.length >= Math.min(o.max || 3, 3) || words + t.words > 1700) continue
    if (out.some(x => (x.sub || '') === (t.sub || '') || authorOf(x.id) === authorOf(t.id))) continue
    out.push(t)
    words += t.words
  }
  return out
}

export function liveExamplesText(list: LiveText[]): string {
  return 'Так звучат живые психологи. Возьми устройство и манеру, не слова и не темы.\n\n' +
    list.map((t, i) => `<пример ${i + 1} ${t.source === 'tg' ? 'пост в Telegram' : t.source === 'karusel' ? 'карусель' : 'ролик'}>\n${t.text}\n</пример ${i + 1}>`).join('\n\n')
}

// ---------- zh: ход (раздел «Ходы ПЖ» в 03-PROMPTY.md) ----------
const MOVE_BY_FORMAT: Partial<Record<string, string>> = {
  reels_scenka: 'hod_dialog', reels_rol: 'hod_rol', reels_spisok: 'hod_spisok', carousel: 'hod_karusel', reels_istoriya: 'hod_priznanie',
}
// ход по формату, иначе по смыслу (вторая строка карточки «Смыслы: ...»), по кругу от материала к материалу
export function chooseMove(moves: Record<string, string>, format: FormatCode, intent: string, rotation: number): string {
  if (intent === 'priglashenie' && moves.hod_zovu) return moves.hod_zovu
  const byFormat = MOVE_BY_FORMAT[format]
  if (byFormat && moves[byFormat]) return moves[byFormat]
  const fit = Object.entries(moves).filter(([code, card]) => !['hod_dialog', 'hod_rol', 'hod_spisok', 'hod_zovu', 'hod_priznanie', 'hod_karusel'].includes(code) && (card.split('\n')[1] || '').includes(intent))
  const pool = fit.length ? fit : Object.entries(moves).filter(([code]) => ['hod_raznesti', 'hod_beshus', 'hod_svoi', 'hod_poymat', 'hod_komment'].includes(code))
  return pool[rotation % pool.length][1]
}
// для промпта: без строки «Смыслы», с понятным заголовком
export const moveText = (card: string) => card.split('\n').filter((l, i) => i !== 1).join('\n').replace(/^\[[a-z_]+\]\s*/, 'Ход: ').replace(/\s*\([^)]*\)\s*$/m, '')
