// zh6 (08.11): текст и план тем с нуля. Включается PROMPT_HYP=zh6 (simple.ts отдает сюда), прод и zh5* не меняются.
// Текст: один вызов писателя (свои тексты автора первыми, 2-3 живых примера по формату, голосу и смыслу, устройство
// по кругу, конец по задаче), finalNet, проверки кодом (копия из 4 слов, «не X, а Y», мат) и одна правка названных мест.
// План тем: один вызов, JSON, чистка и пометки кодом без платной замены.
import { callModel, callJson } from '../ai'
import { isReels, type FormatCode } from '../text-guard'
import { finalNet, stripServiceTags } from './text'
import type { GenContext, GenRequest } from '../pipeline'
import type { AuthorSettings } from '../settings'
import { TEKST_SYSTEM, KONEC, SAMPLES_HEAD, PRIMERY_HEAD, KONCY, REAKCII } from './prompt-tekst'
import { FORMATY, formatByCode, goditsyaGolosu, formatCodeOf, formatBlock, bezGolosa, type Format6 } from './formaty'
import { TEMY_SYSTEM, TEMY_ZHIVYE_HEAD } from './prompt-temy'
import { TEMY_ZHIVYE } from './temy-zhivye'
import { pickPrimery, primeryBlock, authorVoice, bankFormat, hasMat, type Primer } from './primery'
import { zh6Mesta, words, copyPieces, MAT, type Mesto } from './checks'
import { neXaY } from './text'

const fill = (t: string, v: Record<string, string>) => t.replace(/\{\{(\w+)\}\}/g, (_m, k) => v[k] ?? '')
const seedOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

// что помнит прогон или продукт про прошлые тексты автора: устройства и примеры (чтобы не повторять)
export type Zh6Memory = { ustr: string[]; primery: string[]; nach?: string[]; kon?: string[]; priemy?: string[] }
export const zh6MemOf = (ctx: GenContext): Zh6Memory => ((ctx.memory as any)?.zh6 as Zh6Memory) || { ustr: [], primery: [] }

export const allowMatOf = (s: AuthorSettings) => !/^не использовать/u.test(s.profanityRule || '')

// как автор пишет мат в своих текстах: со звездочкой в середине слова или целиком (замечание Арины 09.11: в одном
// тексте то так, то так; одно правило по образцам автора, в темах так же)
export const matZvezdy = (s: AuthorSettings) => {
  // zh6-prod 10.11: сначала явный выбор психолога, потом «Иногда, со звездочкой» (profanity light), потом образцы
  if (typeof s.matZvezdyVybor === 'boolean') return s.matZvezdyVybor
  if (/^можно точечно/u.test(s.profanityRule || '')) return true
  return /\p{L}[\*•]+\p{L}/u.test(s.samples.join('\n'))
}
// звездочка в середину матерного слова (автору, который пишет со звездочкой)
export function zvezdochki(text: string): string {
  return text.replace(new RegExp(MAT.source, 'giu'), m => /[\*•]/.test(m) || m.length < 3 ? m : m.slice(0, 1) + '*' + m.slice(2))
}

function matRule(s: AuthorSettings): string {
  if (!allowMatOf(s)) return 'Автор не матерится. Без мата и грубых слов.'
  const own = hasMat(s.samples.join('\n'))
  const kak = matZvezdy(s) ? 'Мат везде со звездочкой в середине слова (п*здец), как у автора, и в надписях, и в речи, и в подписи.' : 'Мат везде пишется целиком, без звездочек, как у автора в текстах: и в речи, и в надписи, и в подписи.'
  if (own || s.intensity === 'hot') return `Автор матерится, как в своих текстах. Мат у него обычные слова речи: в эмоции, в присказке, в точке удара, сколько раз, столько и как у него. Не вставляй его между запятыми посреди спокойной фразы и не ставь эпитетом перед словом. ${kak}`
  return `Мат автору можно, но в своих текстах он почти не матерится: одно грубое слово, только если правда к месту, а лучше без него. ${kak}`
}

// длина по формату и по своим текстам автора
function dlinaOf(format: FormatCode, s: AuthorSettings): string {
  const own = median(s.samples.map(t => words(t).length).filter(n => n >= 30))
  if (isReels(format)) {
    if (own && own < 110) return '70-130 слов, как у автора'
    return own && own > 220 ? '120-220 слов' : '90-180 слов'
  }
  if (format === 'post_tg') return own ? `около ${Math.max(100, Math.min(350, own))} слов, как у автора` : '120-300 слов'
  return own ? `около ${Math.max(80, Math.min(260, own))} слов, как у автора` : '80-220 слов'
}

const SMYSL: Record<string, string> = {
  uznavanie: 'узнавание: читатель видит себя', obyasnenie: 'объяснение: понятно, почему так происходит', mehanizm: 'объяснение: понятно, почему так происходит',
  podderzhka: 'поддержка: читателю становится легче и не стыдно', razreshenie: 'поддержка: читателю становится легче и не стыдно',
  poziciya: 'позиция автора', mif: 'позиция автора', kak_v_terapii: 'как это бывает в терапии', priglashenie: 'приглашение к автору',
  yumor: 'улыбнуться и узнать себя',
}

function authorBlock(s: AuthorSettings): string {
  return [
    `Автор: ${s.name || 'психолог'}, пишет о себе в ${s.genderForms}. К читателю обращается ${s.address}.`,
    s.niche ? `О чем блог: ${s.niche}${s.blogAbout ? `; ${s.blogAbout}` : ''}.` : '',
    s.approach ? `Подход: ${s.approach}.` : '',
    s.intensity === 'hot' ? 'Говорит на эмоциях, резко, может капсом одно слово.' : s.intensity === 'calm' ? 'Говорит спокойно и бережно.' : s.intensity === 'live' ? 'Говорит живо, как в разговоре.' : '',
    matRule(s),
    s.voiceBrief ? `Как звучит автор по его текстам:\n${s.voiceBrief}` : s.toneVerbal ? `Как автор сам описал свою манеру: ${s.toneVerbal}` : '',
  ].filter(Boolean).join('\n')
}

// приметы голоса по текстам автора, посчитанные кодом: средняя фраза, абзацы, вопросы, мат на 100 слов. Модель сама их
// не замечает и пишет ровно (раунды 1-6), поэтому даем числа
export function golosAvtora(samples: string[]): string {
  const ok = samples.filter(t => words(t).length >= 40)
  if (!ok.length) return ''
  const all = ok.join('\n\n')
  const w = words(all).length
  const frazy = all.split(/[.!?…]+(?:\s|$)/u).filter(x => words(x).length > 0)
  const fr = Math.round(w / Math.max(1, frazy.length))
  const korot = frazy.filter(x => words(x).length <= 4).length
  const abz = ok.map(t => t.split(/\n\s*\n|\n(?=\S)/).filter(x => words(x).length > 0).length)
  const vopr = (all.match(/\?/g) || []).length
  const mat = (all.match(new RegExp(MAT.source, 'giu')) || []).length
  const per = (n: number) => Math.round((n / w) * 1000) / 10
  return [
    `средняя фраза ${fr} слов${korot ? `, коротких фраз в 1-4 слова около ${per(korot)} на 100 слов` : ''}`,
    `абзацев в тексте обычно ${Math.min(...abz)}-${Math.max(...abz)}${Math.max(...abz) <= 2 ? ' (пишет сплошным текстом)' : ''}`,
    `вопросов около ${per(vopr)} на 100 слов`,
    mat ? `мата около ${per(mat)} на 100 слов, в разных местах фразы` : 'мата нет',
  ].join('; ')
}

// материал автора: одно на текст по кругу (позиция, фраза клиента, история), чтобы не вставлять одно и то же везде
function materialOf(s: AuthorSettings, topic: string, n: number): string {
  const phrases = String(s.clientPhrases || '').split(/;\s*/).map(x => x.trim()).filter(Boolean)
  const opts = [
    s.position ? `Взгляд автора на свою тему (если берешь, говори это как утверждение, без «я не люблю» и «меня злит»): ${s.position}` : '',
    phrases.length ? `Так говорят клиенты автора (своими словами, без имен): ${phrases[n % phrases.length]}` : '',
    s.stories?.length ? `История автора о себе (можно рассказать, если ложится на тему): ${s.stories[n % s.stories.length].text}` : '',
  ].filter(Boolean)
  if (!opts.length) return ''
  return `${opts[n % opts.length]}\nВзять это в текст можно, если ложится на тему. Не ложится, не бери. Других фактов об авторе не придумывай.`
}

// устройство текста: по кругу, без трех последних у этого автора
// формат каталога для текста: из запроса (план тем его поставил) или по кругу из подходящих автору этого типа
// в кадре ли психолог: говорящая голова и сценки (роль, гайд, доска) снимаются в камеру; беззвучный рилс нет
export const vKadre = (f: Format6) => f.for[0] === 'reels' && !bezGolosa(f)
// подходит ли формат психологу: голос, и при «Пока без видео» без форматов, где он в кадре (zh6-prod 10.11)
export const goditsya = (f: Format6, voice: string[], video = true) => goditsyaGolosu(f, voice) && (video || !vKadre(f))
export function chooseFormat6(fmt: string, voice: string[], mem: Zh6Memory, seed: string, want?: string | null, video = true): Format6 {
  const tip = fmt === 'post_tg' ? 'post' : fmt
  // формат из плана берем, только если его тип совпадает с тем, что нажали (из плана сценка, а нажали «Пост», не берем)
  const byCode = want ? formatByCode(want) : undefined
  // тип формата по главному назначению (for[0]): по нему formatCodeOf и разметка, иначе «перевод» для карусели ушел бы рилсом
  if (byCode && byCode.for[0] === tip && (video || !vKadre(byCode))) return byCode
  const ok = FORMATY.filter(f => f.for[0] === tip && goditsya(f, voice, video))
  const list = ok.filter(f => !(mem.ustr || []).slice(-3).includes(f.code))
  const pool = list.length ? list : ok.length ? ok : FORMATY.filter(f => f.for[0] === tip)
  return pool[(seedOf(seed) + (mem.ustr || []).length) % pool.length]
}

// конец по кругу без двух последних; вопрос к читателю и просьба в комментарии не чаще трети (замечание Арины 6)
export function chooseKrug(all: Record<string, string>, last: string[], seed: string, skip: string[] = []): string {
  const voprosNedavno = last.slice(-2).some(k => k === 'vopros' || k === 'kommentarii')
  const ok = Object.keys(all).filter(k => !skip.includes(k) && !(voprosNedavno && (k === 'vopros' || k === 'kommentarii')))
  const fresh = ok.filter(k => !last.slice(-2).includes(k))
  const list = fresh.length ? fresh : ok
  return list[(seedOf(seed) + last.length) % list.length]
}

// логика текста кодом (круг 4): один род у «ты», одно имя у одного персонажа, регалии в представлении
const ROLI = /(?<![\p{L}])((?:[Кк]ошк|[Кк]от|[Сс]обак|[Пп]ес|[Пп]са|[Дд]очь|[Дд]очк|[Дд]оч|[Сс]ын|[Мм]ам|[Пп]ап|[Мм]уж|[Жж]ен|[Пп]одруг|[Дд]руг|[Кк]оллег|[Нн]ачальни|[Бб]абушк|[Бб]рат|[Сс]естр)\p{L}*)\s+([А-ЯЁ][а-яё]{2,})/gu

export function logikaMesta(text: string, s: AuthorSettings, opts?: { format6?: string }): Mesto[] {
  const out: Mesto[] = []
  // пометки для художника внутри текста («Нарисованный Миша», «(рисунок: ...)», «кадр:»)
  const hud = text.match(/(?<![\p{L}])(?:нарисованн\p{L}*\s+[А-ЯЁ]?\p{L}+|\(?\s*(?:рисунок|картинка|кадр|иллюстрация)\s*:[^)\n]{0,60}\)?)/iu)
  if (hud) out.push({ code: 'hudozhnik', quote: hud[0], why: 'пометка для художника внутри текста: напиши, что происходит, без указаний к картинке' })
  // «ты» в мужском и женском роде в одном тексте (у автора без родовых окончаний модель путает: «оказался ты» и «разозлилась»)
  const muzh = [...text.matchAll(/(?<![\p{L}])ты\s+(?:уже\s+|опять\s+|снова\s+|же\s+|сам\s+)?(\p{L}{2,}(?:л|лся))(?![\p{L}])/giu)]
  const zhen = [...text.matchAll(/(?<![\p{L}])ты\s+(?:уже\s+|опять\s+|снова\s+|же\s+|сама\s+)?(\p{L}{2,}(?:ла|лась))(?![\p{L}])/giu)]
  if (muzh.length && zhen.length) out.push({ code: 'rod', quote: (zhen.length <= muzh.length ? zhen[0] : muzh[0])[0], why: '«ты» в тексте то в мужском, то в женском роде: выбери один род на весь текст' })
  // одно имя у одного персонажа: «дочь Маша» и «кошка Маша»
  const imena: Record<string, Set<string>> = {}
  for (const m of text.matchAll(ROLI)) { const r = m[1].toLowerCase().slice(0, 3); (imena[m[2]] = imena[m[2]] || new Set()).add(r) }
  for (const [n, r] of Object.entries(imena)) if (r.size > 1) out.push({ code: 'imya', quote: n, why: `имя ${n} у двух разных персонажей: у одного персонажа одно имя, лишних не добавляй` })
  // карусель-история с персонажами: рассказчик говорит о героях в третьем лице, без слайда-лекции на «ты» посреди истории
  if (opts?.format6 === 'carousel_istoriya_dialog') {
    const slidy = text.split(/\n(?=\s*Слайд \d+\s*:)/u).filter(x => /^\s*Слайд/u.test(x))
    for (const sl of slidy.slice(1, -1)) {
      const bezRepl = sl.replace(/[«"„“][^»"”]*[»"”]/gu, ' ').replace(/^\s*Слайд \d+\s*:/u, '').split('\n').filter(l => !/^\s*[А-ЯЁ][\p{L} ]{0,20}:/u.test(l)).join(' ')
      if (/(?<![\p{L}])(?:ты|тебя|тебе|тобой|твой|твоя|твои|твое)(?![\p{L}])/iu.test(bezRepl) && words(bezRepl).length > 12) { out.push({ code: 'istoriya_ty', quote: sl.trim().split('\n')[0].slice(0, 120), why: 'в карусели-истории рассказчик говорит о героях в третьем лице: этот слайд обращается к читателю на «ты» лекцией посреди истории, перескажи его через героев' }); break }
    }
  }
  // представление: только имя, метод и с чем работает из профиля, без опыта, регалий и цифр
  const podp = (text.match(/^\s*Подпись\s*:([\s\S]*)$/mu) || [])[1] || (/^\s*(?:Слайд|Текст на экране|Речь)/mu.test(text) ? '' : text.split(/\n\s*\n/).slice(-2).join('\n'))
  const reg = podp.match(/(?:\d+\s*(?:лет|год)\w*\s+(?:опыт|практик)|сертифицирован\p{L}*|кандидат\s+наук|член\s+\p{L}*\s*ассоциац\p{L}*|более\s+\d+\s+клиент\p{L}*)/iu)
  if (reg) out.push({ code: 'regalii', quote: reg[0], why: 'в представлении только имя, метод и с чем работаешь из профиля: без опыта, регалий и цифр' })
  void s
  return out
}
// ремарки в сценках одинаково: «*смеется*» и «[смеется]» в круглые скобки (служебная строка [смена] не трогается)
export const remarki = (t: string) => t.replace(/\*([а-яё][а-яё ,]{2,40})\*/giu, '($1)').replace(/\[(?!смена\])([а-яё][а-яё ,]{2,40})\]/giu, '($1)')

// приемы автора (zh6-prod 10.11, сверка со стоком: «со мной можно» у живых в 4 текстах из 178, «так, стоп» в 2, «если в
// детстве» в 2): живые приемы не чаще раза у автора по памяти (около 10 последних материалов). «Никогда» (vsegda) только
// на то, чего у живых 0: «может сохраняться», «в терапии я предлагаю / есть место», объявление термина, полуврачебный совет
export const PRIEMY: Record<string, { re: RegExp; name: string; vsegda?: boolean }> = {
  predstavte: { re: /представ(?:ьте|им|ляешь)[^.!?\n]{0,40}(?:разговор|консультаци|сесси)/iu, name: 'рамка «представьте разговор на консультации»' },
  sobiratelnyy: { re: /собирательн\p{L}* (?:разговор|образ|случа)/iu, name: '«собирательный разговор»' },
  rezhim: { re: /(?<![\p{L}])режим\p{L}* (?:удобн|хорош|понимающ|идеальн|заботлив)/iu, name: '«режим удобной / хорошей / понимающей»' },
  nazyvayu: { re: /я называю это|я это называю/iu, name: '«я называю это»' },
  detstvo: { re: /если в детстве/iu, name: 'объяснение «если в детстве X, то Y»' },
  takstop: { re: /так,? стоп/iu, name: 'реплика-поворот «так, стоп»' },
  vterapii: { re: /в терапии (?:важно|можно) (?:разобраться|задержаться)|в терапии я (?:предлагаю|бы предложил)|в терапии есть место/iu, name: 'реклама терапии посреди текста («в терапии я предлагаю...», «в терапии есть место...»)', vsegda: true },
  somnoj: { re: /со мной (?:тоже )?можно (?:спорить|злиться|не соглашаться|быть)/iu, name: 'мысль «со мной можно спорить / злиться» (одинаковая у всех психологов)' },
  termin: { re: /(?:^|[.!?:]\s+|\n)Это (?:называется\s+)?(?:навязывание|газлайтинг|созависимост|проекци|триангуляци|обесценивани|контроль под видом|пассивн\p{L}* агресси)/iu, name: 'объявление термина посреди текста («это навязывание вины»)', vsegda: true },
  medsovet: { re: /(?:понемногу|постепенно)\s+(?:откладыва|сокраща|реже)\p{L}*[^.!?\n]{0,30}(?:провер|измер|пульс|давлен)|(?:реже|не)\s+(?:измеряйте|проверяйте)\s+(?:пульс|давление)/iu, name: 'совет, похожий на медицинский', vsegda: true },
  uchebnik: { re: /(?:может|могут) сохраняться|важно разобраться|важно понимать|важно помнить/iu, name: 'объяснение из учебника («может сохраняться», «важно разобраться»)', vsegda: true },
}
export function priemyOf(text: string): string[] { return Object.entries(PRIEMY).filter(([, p]) => p.re.test(text)).map(([k]) => k) }

// реакция зрителя: из плана (req.reakciya) или по задаче; приглашение только при задаче «запись»
export type Reakciya = 'uznavanie' | 'podderzhka' | 'poziciya' | 'priglashenie'
export function reakciyaOf(req: GenRequest, rol: string): Reakciya {
  const r = (req as any).reakciya as Reakciya | undefined
  if (rol === 'zapis') return 'priglashenie'
  if (r && r !== 'priglashenie' && REAKCII[r]) return r
  return rol === 'doverie' ? 'poziciya' : 'uznavanie'
}
// данные для представления только из профиля: имя, метод, с чем работает
export function introOf(s: AuthorSettings): string {
  const parts = [s.name ? `имя ${s.name}` : '', s.approach ? `метод ${s.approach}` : '', s.niche ? `с чем работает: ${s.niche.split(':')[0]}` : ''].filter(Boolean)
  return parts.length >= 2 ? parts.join('; ') : ''
}

// развязки сценки «я и внутренний голос» по кругу (круг 3: во всех сценках одна схема с «так, стоп»)
export const RAZVYAZKI = ['голос побеждает, и я делаю, как он сказал', 'я соглашаюсь с голосом и смеюсь над собой', 'обрыв на полуслове', 'вмешивается третий голос (мама, подруга, ребенок, кот)', 'голос сам устает и замолкает', 'я отвечаю голосу его же словами']

// код формата для сохранения и экрана: тип каталога плюс то, что нажали (post_tg и stories не теряются)
export function formatGen(f6: Format6, zaprosheno: FormatCode): FormatCode {
  const c = formatCodeOf(f6)
  if (c === 'post' && zaprosheno === 'post_tg') return 'post_tg'
  return c
}
// счетчик материалов автора для ротации: полное число (memory.total из memory.ts), иначе 10 последних
export const schetOf = (ctx: GenContext) => Number((ctx.memory as any)?.total ?? ctx.memory?.count ?? 0) || 0

export type Zh6Prompt = { system: string; user: string; primery: Primer[]; ustr: string; fmt: string; nach: string; kon: string; format6: Format6 }
export function zh6Prompt(ctx: GenContext, req: GenRequest): Zh6Prompt {
  const s = ctx.settings
  const mem = zh6MemOf(ctx)
  const voice = authorVoice(s)
  const seed = `${s.name || ''}|${req.topic}`
  // сторис остаются сторис, пост для Telegram выбирает формат из постов, но остается постом Telegram (zh6-prod 10.11)
  const fmt0 = isReels(req.format) ? 'reels' : req.format === 'post_tg' ? 'post_tg' : req.format === 'carousel' ? 'carousel' : req.format === 'stories' ? 'stories' : 'post'
  const f6 = chooseFormat6(fmt0, voice, mem, seed, req.formatKod, s.snimaetVideo !== false)
  const format = formatGen(f6, req.format)
  const fmt = f6.for[0] === 'reels' ? 'reels' : f6.for[0]
  const n = schetOf(ctx) + (mem.ustr || []).length
  const smysl = req.intent && SMYSL[req.intent] ? req.intent : 'uznavanie'
  const primery = pickPrimery({ format, voice, smysl, allowMat: allowMatOf(s), seed: `${s.name || ''}|${n}`, exclude: mem.primery.slice(-9), count: s.samples.length >= 2 ? 2 : 3 })
  const rol = req.rol || (smysl === 'priglashenie' ? 'zapis' : smysl === 'kak_v_terapii' ? 'doverie' : 'ohvat')
  const kon = chooseKrug(KONCY, mem.kon || [], `${seed}|k`, fmt === 'carousel' ? [] : ['obryv'])
  const bylo = [...new Set(mem.priemy || [])].filter(k => PRIEMY[k] && !PRIEMY[k].vsegda).map(k => PRIEMY[k].name)
  const reak = reakciyaOf(req, rol)
  // представление в подписи: в приглашении всегда, иначе примерно каждый четвертый текст автора (Арина 09.11)
  const nInt = schetOf(ctx) + (mem.ustr || []).length
  const intro = !bezGolosa(f6) && (rol === 'zapis' || nInt % 4 === 3) ? introOf(s) : ''
  const razv = f6.code === 'reels_scenka_vnutr_golos' ? RAZVYAZKI[(seedOf(seed) + (mem.ustr || []).length) % RAZVYAZKI.length] : ''
  const own = s.samples.slice(0, 3)
  const user = [
    `<автор>\n${authorBlock(s)}\n</автор>`,
    own.length ? `<тексты_автора>\n${SAMPLES_HEAD}\n\n${own.map((t, i) => `Текст ${i + 1}:\n${t.trim()}`).join('\n\n')}${golosAvtora(s.samples) ? `\n\nПосчитано по этим текстам: ${golosAvtora(s.samples)}. Держи примерно так же.` : ''}\n</тексты_автора>` : '',
    primery.length ? `<примеры>\n${PRIMERY_HEAD}\n\n${primeryBlock(primery)}\n</примеры>` : '',
    `<формат>\n${formatBlock(f6)}\n</формат>`,
    `<задание>\nТема: ${req.topic}\n${req.userDetail ? `Деталь от автора: ${req.userDetail}\n` : ''}Что дать читателю: ${SMYSL[smysl]}.\n${rol === 'zapis' || bezGolosa(f6) ? '' : `Если формат не задает свой конец, закончи ${KONCY[kon]}.\n`}${REAKCII[reak]}\n${intro ? `В подписи представься одной строкой, только этими данными, ничего не добавляя (ни опыта, ни регалий, ни цифр): ${intro}.${rol === 'zapis' ? ' Сразу за представлением мягкое приглашение одной строкой.' : ''}\n` : ''}${razv ? `Развязка сценки в этот раз: ${razv}.\n` : ''}${fill(KONEC[rol], { booking: [s.booking, s.kodovoeSlovo ? `кодовое слово «${s.kodovoeSlovo}»` : ''].filter(Boolean).join('; ') || 'как указано в профиле' })}${bylo.length ? `\nЭти приемы у автора уже были, второй раз не бери: ${bylo.join('; ')}.` : ''}\n</задание>`,
    (() => { const m = materialOf(s, req.topic, n); return m ? `<материал_автора>\n${m}\n</материал_автора>` : '' })(),
    req.coreBlock ? `<ядро>\n${req.coreBlock}\n</ядро>` : '',
    req.sampleBlock ? `<как_устроен_образец>\n${req.sampleBlock}\n</как_устроен_образец>` : '',
    ctx.editPairs ? `<как_автор_правит>\n${ctx.editPairs}\n</как_автор_правит>` : '',
  ].filter(Boolean).join('\n\n')
  const samo = samoOf(req)
  return { system: samo === 'vnutri' ? `${TEKST_SYSTEM}\n\n${SAMO_VNUTRI}` : TEKST_SYSTEM, user, primery, ustr: f6.code, fmt, nach: '', kon, format6: f6 }
}

// ---------- самопроверка (идея Арины 09.11): внутри промпта писателя или отдельным шагом ----------
export type Samo = 'net' | 'vnutri' | 'shag'
// шаг 5 (09.11): вслепую на 4 темах проверка внутри промпта лучшая во всех четырех, отдельный шаг почти не меняет текст
// (его версии близнецы версии без проверки); внутри не стоит лишнего вызова (test/zh6/v2-samo/kritik.md)
export const SAMO_DEFAULT: Samo = 'vnutri'
export const samoOf = (req: GenRequest): Samo => ((req as any).samo || process.env.ZH6_SAMO || SAMO_DEFAULT) as Samo
export const SAMO_SPISOK = `кальки и обороты, будто переведенные с английского; книжные и канцелярские слова; фразы, которые надо перечитать, чтобы понять; нелогичные места; скучные места, где хочется пролистать; фразы, которые живой человек вслух не скажет`
export const SAMO_VNUTRI = `Перед тем как отдать текст, перечитай и исправь: ${SAMO_SPISOK}. Голос, мат, иронию и формат при этом не трогай. Ответ только текст.`
const SAMO_CHECK_SYSTEM = `Ты строгий редактор живых текстов психологов для соцсетей. Найди в тексте плохие фразы: ${SAMO_SPISOK}. Мат, резкость, ирония и разговорные слова автора не ошибка. Выпиши каждую плохую фразу дословно, как она стоит в тексте, и причину одним словом: kalka, knizhno, neponyatno, nelogichno, skuchno, ne_po_golosu. Не больше шести фраз, только настоящие. Ответ строго JSON: {"frazy":[{"fraza":"...","prichina":"..."}]}`
const SAMO_FIX_SYSTEM = `Ты редактор текстов психолога. Перепиши только названные фразы, остальной текст оставь слово в слово. Новая фраза звучит просто и живо, как сказал бы этот автор вслух, в его голосе: мат, ирония, резкость и обращение остаются. Метки строк не трогай. Без тире и буквы «ё». Верни весь текст целиком, без пояснений.`

export type SamoResult = { frazy: { fraza: string; prichina: string }[]; naideno: number; vzyato: boolean; prichina?: string }
export async function samoShag(ctx: GenContext, text: string): Promise<{ text: string; r: SamoResult }> {
  const s = ctx.settings
  const raw: any = await callJson({ system: SAMO_CHECK_SYSTEM, user: `<текст>\n${text}\n</текст>`, effort: 'low', verbosity: 'low', maxTokens: 3000, timeoutMs: 60000, writer: true, userId: ctx.userId, operation: 'generate_post_zh6_samo_check', knownNames: s.knownNames })
  const all: { fraza: string; prichina: string }[] = (Array.isArray(raw?.frazy) ? raw.frazy : []).map((x: any) => ({ fraza: String(x?.fraza || '').trim(), prichina: String(x?.prichina || '') })).filter((x: any) => x.fraza.length > 3)
  const frazy = all.filter(x => text.includes(x.fraza)).slice(0, 6)
  if (!frazy.length) return { text, r: { frazy: all, naideno: 0, vzyato: false, prichina: all.length ? 'фразы не найдены дословно' : 'плохих фраз нет' } }
  const list = frazy.map((x, i) => `${i + 1}. «${x.fraza}» (${x.prichina})`).join('\n')
  const fixed = finalNet(stripServiceTags(await callModel({ system: SAMO_FIX_SYSTEM, user: `<текст>\n${text}\n</текст>\n\n<фразы>\n${list}\n</фразы>`, effort: 'low', verbosity: 'medium', maxTokens: 6000, timeoutMs: 60000, writer: true, userId: ctx.userId, operation: 'generate_post_zh6_samo_fix', knownNames: s.knownNames })))
  const why = samoGuard(text, fixed, allowMatOf(s))
  return why ? { text, r: { frazy, naideno: frazy.length, vzyato: false, prichina: why } } : { text: fixed, r: { frazy, naideno: frazy.length, vzyato: true } }
}
// правку самопроверки не берем, если сломан формат, пропал мат автора, добавлено «не X, а Y» или длина ушла
export function samoGuard(before: string, after: string, allowMat: boolean): string {
  if (!after.trim()) return 'пустой ответ'
  if (LABELS(after) !== LABELS(before)) return 'сломаны метки строк'
  const dl = words(after).length / Math.max(1, words(before).length)
  if (dl < 0.75 || dl > 1.25) return `длина ушла (${dl.toFixed(2)})`
  if (allowMat && hasMat(before) && !hasMat(after)) return 'пропал мат'
  if (neXaY(after).length > neXaY(before).length) return 'добавлено «не X, а Y»'
  return ''
}

const REPAIR_SYSTEM = `Ты редактор текстов психолога. Перепиши только названные места, остальной текст оставь слово в слово. Метки строк («Текст на экране:», «Речь:», «Слайд N:», «Подпись:») не трогай. Голос автора сохраняй: мат, иронию, резкость, обращение. Новое место звучит просто и живо, как сказал бы этот автор вслух. Без тире и буквы «ё». Верни весь текст целиком, без пояснений.`

const LABELS = (t: string) => (t.match(/^\s*(?:Слайд \d+|Текст на экране|Речь|Подпись|Экран \d+)\s*:/gmu) || []).map(x => x.trim()).join('|')

export type Zh6Result = { text: string; format: FormatCode; intent: string; draft: string; cut: string[]; zh4?: any; zh6: { ustr: string; formatName: string; primery: string[]; nach: string; kon: string; priemy: string[]; mesta: Mesto[]; ostalos: Mesto[]; pravka: boolean; rol: string; samo: Samo; samoResult?: SamoResult; doSamo?: string } }

// nginx на проде ждет ответа 120 с (proxy_read_timeout): писатель и правка мест вместе укладываются в 110 с,
// правку с остатком меньше 15 с не начинаем (текст писателя уходит как есть, находки остаются в ostalos)
const ZH6_DEADLINE_MS = 110000
const ZH6_MIN_FIX_MS = 15000

export async function zh6Write(ctx: GenContext, req: GenRequest): Promise<Zh6Result> {
  const s = ctx.settings
  const p = zh6Prompt(ctx, req)
  const format: FormatCode = formatGen(p.format6, req.format)
  const intent = req.intent || 'uznavanie'
  const rol = req.rol || (intent === 'priglashenie' ? 'zapis' : intent === 'kak_v_terapii' ? 'doverie' : 'ohvat')
  const samo = samoOf(req)
  // общий бюджет запроса: nginx ждет 120 с, правки после писателя получают только остаток (ostatok)
  const t0 = Date.now()
  const raw = stripServiceTags(await callModel({ system: p.system, user: p.user, effort: (process.env.ZH6_EFFORT as any) || 'low', verbosity: 'medium', maxTokens: 8000, timeoutMs: Number(process.env.GENERATION_WRITER_TIMEOUT_MS) || 100000, writer: true, userId: ctx.userId, operation: 'generate_post_zh6', knownNames: s.knownNames }))
  if (!raw.trim()) throw new Error('Empty model response')
  const draft = finalNet(raw)
  let text = draft
  let samoResult: SamoResult | undefined
  if (samo === 'shag') { try { const r = await samoShag(ctx, text); text = r.text; samoResult = r.r } catch { /* проверка не вышла: текст писателя */ } }
  const doSamo = text !== draft ? draft : undefined
  const sources = [...p.primery.map(x => x.text), ...s.samples]
  // приемы, которые у автора уже были, и рамки консультации всегда: на правку мест
  const bylo = new Set(zh6MemOf(ctx).priemy || [])
  const priemMesta = (t: string): Mesto[] => priemyOf(t).filter(k => PRIEMY[k].vsegda || bylo.has(k)).map(k => ({ code: `priem_${k}`, quote: (t.match(PRIEMY[k].re) || [''])[0], why: `${PRIEMY[k].name}: у автора уже было или так не пишем, скажи по-другому` }))
  // кодовое слово только из профиля (ответ Арины 09.11): слово капсом в кавычках рядом с «напишите» или «комментарии»
  const kodMesta = (t: string): Mesto[] => [...t.matchAll(/(?:слов[оа]\s+|напишите\s+|пишите\s+)[«"]?([А-ЯЁA-Z]{3,})[»"]?/gu)].filter(m => !`${s.booking || ''} ${s.kodovoeSlovo || ''}`.toUpperCase().includes(m[1])).map(m => ({ code: 'kodovoe_slovo', quote: m[0], why: 'кодового слова нет в профиле автора: напиши просто «напишите мне в директ», без придуманного слова и без обещания что-то прислать' }))
  const mestaOf = (t: string) => [...zh6Mesta(t, { sources, allowMat: allowMatOf(s) }), ...priemMesta(t), ...kodMesta(t), ...logikaMesta(t, s, { format6: p.format6.code })]
  const mesta = mestaOf(text)
  let pravka = false
  const ostatok = ZH6_DEADLINE_MS - (Date.now() - t0)
  if (mesta.length && ostatok >= ZH6_MIN_FIX_MS) {
    try {
      const list = mesta.map((m, i) => `${i + 1}. «${m.quote}»: ${m.why}`).join('\n')
      const fixed = finalNet(stripServiceTags(await callModel({ system: REPAIR_SYSTEM, user: `<текст>\n${text}\n</текст>\n\n<места>\n${list}\n</места>`, effort: 'low', verbosity: 'medium', maxTokens: 6000, timeoutMs: Math.min(60000, ostatok), writer: true, userId: ctx.userId, operation: 'generate_post_zh6_repair', knownNames: s.knownNames })))
      const after = mestaOf(fixed)
      const dl = words(fixed).length / Math.max(1, words(text).length)
      // правку берем, если находок меньше, метки строк те же, длина почти та же и мат автора не пропал
      if (fixed.trim() && after.length < mesta.length && LABELS(fixed) === LABELS(text) && dl > 0.7 && dl < 1.3 && !(hasMat(text) && allowMatOf(s) && !hasMat(fixed))) { text = fixed; pravka = true }
    } catch { /* правка не вышла: оставляем текст */ }
  }
  if (allowMatOf(s) && matZvezdy(s)) text = zvezdochki(text)
  text = remarki(text)
  const ostalos = mestaOf(text)
  const priemy = priemyOf(text)
  const info = { ustr: p.ustr, formatName: p.format6.name, primery: p.primery.map(x => x.id), nach: p.nach, kon: p.kon, priemy }
  return { text, format, intent, draft, cut: [], zh4: { rol, zh6: info }, zh6: { ...info, mesta, ostalos, pravka, rol, samo, samoResult, doSamo } }
}

// ---------- план тем ----------
export type Zh6Tema = { n: number; tema: string; situaciya: string; zadacha: string; reakciya?: string; format: string; pometki: string[] }

const cleanT = (t: string) => String(t || '').replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-').trim()

// ниша автора для подбора живых строк темы: по словам ниши и описания блога
export function nishaOf(s: AuthorSettings): string[] {
  const x = `${s.niche} ${s.blogAbout || ''}`.toLowerCase()
  const out: string[] = []
  if (/самооцен|похвал|стыд|зависть|перфекц|обычн/u.test(x)) out.push('samoocenka')
  if (/тревог|паник|контрол|накручив/u.test(x)) out.push('trevoga')
  if (/злост|злит|раздраж|агресс|срыва/u.test(x)) out.push('zlost')
  if (/отношен|манипул|пар[аеуы]|удобн/u.test(x) && !out.length) out.push('zlost')
  if (/дет|родител|мам/u.test(x) && !out.length) out.push('trevoga')
  return out
}
// 8 живых строк под нишу и голос: 5 своей ниши и 3 общих, без мата автору без мата; с каждым планом другие (r)
export function temyZhivyeFor(s: AuthorSettings, r = 0): string[] {
  const okMat = allowMatOf(s)
  const pool = TEMY_ZHIVYE.filter(x => okMat || !(/\*/.test(x.t) || hasMat(x.t)))
  const nisha = nishaOf(s)
  const own = pool.filter(x => nisha.includes(x.nisha))
  const rest = pool.filter(x => !nisha.includes(x.nisha))
  const sd = seedOf(s.name || '')
  const take = (list: typeof pool, n: number, off: number) => list.length ? Array.from({ length: Math.min(n, list.length) }, (_, i) => list[(sd + off + i) % list.length].t) : []
  const a = take(own, own.length ? 5 : 0, r * 5)
  const b = take(rest, 8 - a.length, r * (8 - a.length))
  return [...new Set([...a, ...b])]
}

// форматы каталога, подходящие голосу автора (без сторис: в плане их нет)
export const formatyAvtora = (s: AuthorSettings) => FORMATY.filter(f => f.for[0] !== 'stories' && goditsya(f, authorVoice(s), s.snimaetVideo !== false))
const formatLine = (f: Format6) => `- ${f.code}: ${f.name} (${f.for[0] === 'reels' ? 'рилс' : f.for[0] === 'post' ? 'пост' : 'карусель'}${f.talking_head ? ', говорящая голова' : ''}${f.short ? ', короткий' : ''}${f.scene ? ', сценка' : ''})`

export function temyPrompt(s: AuthorSettings, o: { n: number; recent?: string[]; rotation?: number }): { system: string; user: string; zhivye: string[] } {
  const r = o.rotation || 0
  const zhivye = temyZhivyeFor(s, r)
  const own = s.samples.slice(0, 2).map(t => t.trim().split(/\s+/).slice(0, 120).join(' '))
  const user = [
    `<автор>\n${authorBlock(s)}\n${s.position ? `Взгляд автора: ${s.position}\n` : ''}${s.clientPhrases ? `Как говорят клиенты автора: ${s.clientPhrases}\n` : ''}Аудитория: ${(s.baseSettings.match(/Аудитория: ([^\n]+)/) || [])[1] || 'не указана'}\n</автор>`,
    own.length ? `<тексты_автора>\nКак автор пишет (начала его текстов, для голоса):\n\n${own.join('\n\n')}\n</тексты_автора>` : '',
    `<форматы>\n${formatyAvtora(s).map(formatLine).join('\n')}\n</форматы>`,
    `<как_звучат_темы>\n${TEMY_ZHIVYE_HEAD}\n${zhivye.map(x => `- ${x}`).join('\n')}\n</как_звучат_темы>`,
    o.recent?.length ? `<уже_были>\nЭти темы у автора уже были, не повторяй их и близкие к ним:\n${o.recent.map(x => `- ${x}`).join('\n')}\n</уже_были>` : '',
    `<задание>\nСоставь ${o.n} тем.\n</задание>`,
  ].filter(Boolean).join('\n\n')
  return { system: TEMY_SYSTEM, user, zhivye }
}

// правила смешивания (задание Арины 09.11): говорящих голов не больше трех, разных форматов не меньше пяти, хотя бы один
// короткий и одна сценка, формат подходит голосу. Нарушение код чинит сам, переставляя формат у лишних тем
export function smeshatOshibki(temy: { format: string }[], dopusk: Format6[]): string[] {
  const fs = temy.map(t => formatByCode(t.format))
  const out: string[] = []
  if (fs.some(f => !f || !dopusk.includes(f))) out.push('формат не из списка автора')
  // круг 3 (09.11, Арина): говорящих голов как у живых, 3-4 на 10 тем, остальное не меньше четырех разных форматов
  const golov = fs.filter(f => f?.talking_head).length
  const estGolovy = dopusk.some(f => f.talking_head)
  const estScenki = dopusk.some(f => f.scene)
  if (golov > Math.ceil(temy.length * 0.4)) out.push('говорящих голов больше четырех')
  if (estGolovy && temy.length >= 6 && golov < Math.floor(temy.length * 0.3)) out.push('говорящих голов меньше трех')
  if (new Set(temy.map(t => t.format).filter(c => !formatByCode(c)?.talking_head)).size < Math.min(4, temy.length - golov)) out.push('других форматов меньше четырех')
  if (!fs.some(f => f?.short)) out.push('нет короткого')
  if (estScenki && !fs.some(f => f?.scene)) out.push('нет сценки')
  return out
}
export function smeshat<T extends { format: string; zadacha?: string }>(temy: T[], dopusk: Format6[], seed: string): T[] {
  const out = temy.map(t => ({ ...t }))
  const sd = seedOf(seed)
  const pick = (ok: (f: Format6) => boolean, used: Set<string>) => {
    const c = dopusk.filter(f => ok(f) && !used.has(f.code))
    const list = c.length ? c : dopusk.filter(ok)
    return list.length ? list[sd % list.length] : undefined
  }
  const used = () => new Set(out.map(t => t.format))
  // неизвестный или неподходящий голосу формат
  for (const t of out) if (!dopusk.some(f => f.code === t.format)) t.format = (pick(f => !f.talking_head, used()) || dopusk[0]).code
  // лишние говорящие головы (с конца плана), потом повторы формата больше двух раз
  for (let guard = 0; guard < 20 && smeshatOshibki(out, dopusk).length; guard++) {
    const fs = out.map(t => formatByCode(t.format)!)
    const need = smeshatOshibki(out, dopusk)
    let i = -1
    if (need.includes('говорящих голов больше четырех')) i = fs.map((f, k) => f.talking_head ? k : -1).filter(k => k >= 0).pop()!
    else {
      const cnt: Record<string, number> = {}
      out.forEach(t => { cnt[t.format] = (cnt[t.format] || 0) + 1 })
      i = out.map((t, k) => (cnt[t.format] > 1 ? k : -1)).filter(k => k >= 0).pop() ?? out.length - 1
    }
    // голов мало: голова встает на место повторного или последнего не-головы
    if (need.includes('говорящих голов меньше трех')) {
      const cnt: Record<string, number> = {}
      out.forEach(t => { cnt[t.format] = (cnt[t.format] || 0) + 1 })
      i = out.map((t, k) => (!fs[k].talking_head && cnt[t.format] > 1 ? k : -1)).filter(k => k >= 0).pop() ?? fs.map((f, k) => (!f.talking_head && !f.short && !f.scene ? k : -1)).filter(k => k >= 0).pop() ?? i
    }
    const want = need.includes('говорящих голов меньше трех') ? (f: Format6) => f.talking_head : need.includes('нет сценки') ? (f: Format6) => f.scene : need.includes('нет короткого') ? (f: Format6) => f.short : (f: Format6) => !f.talking_head
    const f = pick(want, used())
    if (!f) break
    out[i].format = f.code
  }
  return out
}
// порядок тем в плане перемешан по автору (круг 3: у всех тема 1 беззвучный рилс, последняя сценка про сессию), n заново
export function peremeshat<T extends { n: number }>(temy: T[], seed: string): T[] {
  let x = seedOf(seed) || 1
  const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32)
  const a = temy.map(t => ({ ...t }))
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a.map((t, i) => ({ ...t, n: i + 1 }))
}

// многоточие в конце темы не больше одного раза на план (замечание Арины 2): у остальных убираем
export function odnoMnogotochie<T extends { tema: string }>(temy: T[]): T[] {
  let bylo = false
  return temy.map(t => {
    if (!/(?:\.\.\.|…)\s*$/u.test(t.tema)) return t
    if (!bylo) { bylo = true; return t }
    return { ...t, tema: t.tema.replace(/\s*(?:\.\.\.|…)\s*$/u, '') }
  })
}

// пометки кодом
export function temaPometki(t: string, zhivye: string[]): string[] {
  const out: string[] = []
  const w = words(t).length
  if (w > 16) out.push(`длинная (${w} слов)`)
  if (w < 3) out.push('слишком короткая')
  if (neXaY(t).length) out.push('«не X, а Y»')
  if (copyPieces(t, zhivye).length) out.push('копия живой строки')
  if (/не нужно|не помогает, если|не повод/iu.test(t)) out.push('формула разрешения')
  // круг 4: одна мысль у всех психологов и корявые обороты темы
  if (SO_MNOJ.test(t)) out.push('со мной можно')
  if (/мне важно,? (?:чьим|чем|как|что)|может захотеться|захотеться быть/iu.test(t)) out.push('коряво')
  return out
}

export const SO_MNOJ = /со мной (?:тоже )?можно|на меня можно (?:злиться|сердиться)|психологу можно (?:сказать|злиться)|можно злиться на психолога|можно спорить со мной/iu
// приглашение (задача «запись», реакция «написать в директ»): только на больную тему, не чаще одного на 7 тем плана,
// не два подряд и не сразу после узнавания (Арина 09.11); лишние становятся доверием. Реакция сводится с задачей
export const BOLNO = /страх|страшн|бол[ьи]|больн|паник|тревог|близк|ребен|дет[еи]|сын|доч|мам|пап|муж|жен|партнер|отношени|развод|расста|одиноч|измен|насили|крик|срыв|ссор/iu
export function zapisPravila<T extends { zadacha: string; reakciya?: string; tema: string; situaciya?: string }>(temy: T[]): T[] {
  const max = Math.max(1, Math.floor(temy.length / 7))
  let bylo = 0
  return temy.map((t, i) => {
    const x = { ...t }
    if (x.zadacha === 'zapis') {
      const prev = i > 0 ? temy[i - 1] : undefined
      const ok = bylo < max && BOLNO.test(`${x.tema} ${x.situaciya || ''}`) && prev?.zadacha !== 'zapis' && prev?.reakciya !== 'uznavanie'
      if (ok) bylo++
      else x.zadacha = 'doverie'
    }
    if (x.zadacha === 'zapis') x.reakciya = 'priglashenie'
    else if (!x.reakciya || x.reakciya === 'priglashenie') x.reakciya = x.zadacha === 'doverie' ? 'poziciya' : 'uznavanie'
    return x
  })
}

// темы разных авторов не повторяются (замечание Арины 3): сходство по корням (первые 5 букв слов длиннее трех)
const korni = (t: string) => new Set(words(t).filter(w => w.length > 3).map(w => w.slice(0, 5)))
const repliki = (t: string) => (t.match(/[«"„“]([^»"”]{3,80})[»"”]/gu) || []).join(' ')
export function pohozhie(a: string, b: string): boolean {
  if (SO_MNOJ.test(a) && SO_MNOJ.test(b)) return true
  // круг 3: «Я же волнуюсь» у Елены и «Я же просто волнуюсь» у Василисы не ловилось по корням всей строки
  const ra = korni(repliki(a)), rb = korni(repliki(b))
  if (ra.size && rb.size && [...ra].filter(k => rb.has(k)).length >= Math.min(2, ra.size, rb.size) && Math.min(ra.size, rb.size) <= 3) return true
  const x = korni(a), y = korni(b)
  const obshch = [...x].filter(k => y.has(k)).length
  return obshch >= 3 || (obshch >= 2 && obshch / Math.min(x.size, y.size) >= 0.5)
}

const parseTemy = (s: AuthorSettings, raw: any, zhivye: string[]) => (Array.isArray(raw?.temy) ? raw.temy : Array.isArray(raw) ? raw : []).map((x: any, i: number) => {
  const tema0 = cleanT(x.tema || x.title || '')
  const tema = allowMatOf(s) && matZvezdy(s) ? zvezdochki(tema0) : tema0
  const zadacha = ['ohvat', 'doverie', 'zapis'].includes(x.zadacha) ? x.zadacha : 'ohvat'
  return { n: Number(x.n) || i + 1, tema, situaciya: cleanT(x.situaciya || x.situation || ''), zadacha, reakciya: ['uznavanie', 'podderzhka', 'poziciya', 'priglashenie'].includes(x.reakciya) ? x.reakciya : '', format: String(x.format || ''), pometki: temaPometki(tema, zhivye) }
}).filter((x: Zh6Tema) => x.tema)

export async function zh6Plan(s: AuthorSettings, o: { n: number; recent?: string[]; rotation?: number; userId?: string; zamena?: boolean }): Promise<{ temy: Zh6Tema[]; prompt: { system: string; user: string }; smesh: string[] }> {
  const p = temyPrompt(s, o)
  const t0 = Date.now()
  const raw: any = await callJson({ system: p.system, user: p.user, effort: (process.env.ZH6_PLAN_EFFORT as any) || 'low', verbosity: 'medium', maxTokens: 8000, timeoutMs: 100000, writer: true, userId: o.userId || '', operation: 'topic_plan_zh6', knownNames: s.knownNames })
  const temy0: Zh6Tema[] = parseTemy(s, raw, p.zhivye)
  const dopusk = formatyAvtora(s)
  const smesh = smeshatOshibki(temy0, dopusk)
  let temy = zapisPravila(peremeshat(odnoMnogotochie(smesh.length ? smeshat(temy0, dopusk, s.name || '') : temy0), `${s.name || ''}|${o.rotation || 0}`))
  // круг 4: темы с пометками «со мной можно», «коряво», «копия живой строки» на одну замену (один дешевый вызов)
  // «со мной можно» у живых бывает: одна такая тема на план можно, вторая и дальше на замену
  let soMnoj = 0
  const plohie = temy.filter(t => t.pometki.some(x => x === 'коряво' || x === 'копия живой строки' || (x === 'со мной можно' && ++soMnoj > 1))).map(t => ({ n: t.n, why: t.pometki.join(', ') }))
  const ostatok = ZH6_DEADLINE_MS - (Date.now() - t0)
  if (plohie.length && o.zamena !== false && ostatok >= ZH6_MIN_FIX_MS) { try { temy = zapisPravila(await zh6PlanZamena(s, temy, plohie, [], o.userId || '', Math.min(60000, ostatok))) } catch { /* замена не вышла: план как есть */ } }
  return { temy, prompt: { system: p.system, user: p.user }, smesh }
}

// замена тем: повтор у другого автора или копия живой строки; одна замена на тему, формат и задача те же
export async function zh6PlanZamena(s: AuthorSettings, temy: Zh6Tema[], zamena: { n: number; why: string }[], chuzhie: string[], userId = '', timeoutMs = 60000): Promise<Zh6Tema[]> {
  if (!zamena.length) return temy
  const p = temyPrompt(s, { n: zamena.length })
  const user = `${p.user}\n\n<замена>\nВ плане автора эти темы надо заменить новыми, в той же нише, с той же задачей и тем же форматом:\n${zamena.map(z => { const t = temy.find(x => x.n === z.n)!; return `${z.n}. «${t.tema}» (формат ${t.format}, задача ${t.zadacha}): ${z.why}` }).join('\n')}\nНе повторяй темы других авторов:\n${chuzhie.slice(0, 40).map(x => `- ${x}`).join('\n')}\nВерни JSON {"temy":[...]} только с замененными темами, n те же.\n</замена>`
  const raw: any = await callJson({ system: p.system, user, effort: 'low', verbosity: 'medium', maxTokens: 4000, timeoutMs, writer: true, userId, operation: 'topic_plan_zh6_zamena', knownNames: s.knownNames })
  const nov: Zh6Tema[] = parseTemy(s, raw, p.zhivye)
  return odnoMnogotochie(temy.map(t => { const z = nov.find(x => x.n === t.n && zamena.some(y => y.n === t.n)); return z ? { ...t, tema: z.tema, situaciya: z.situaciya || t.situaciya, pometki: z.pometki } : t }))
}

export { bankFormat }

// ---------- «Поправить» для материалов zh6 (zh6-prod 10.11) ----------
// Кнопки «Поправить» в продукте правят текст старыми промптами (pipeline.ts applyButton), они не знают ролей сценки
// («Я:», «Психолог:», «Внутренний голос:»), экранов беззвучного рилса ([смена]) и разметки сторис. Для материала zh6
// роут adjust зовет эту функцию: просьба кнопки и защита разметки. Если разметка сломалась, правку не берем.
const POPRAVIT_SYSTEM = `Ты редактор текстов психолога. Перепиши текст по просьбе автора. Сохрани разметку целиком: метки строк («Текст на экране:», «Речь:», «Слайд N:», «Подпись:», «Экран N:», «Снять:», «Надпись:»), метки ролей в начале реплик («Я:», «Психолог:», «Клиент:» и любые другие), строки [смена] между надписями. Голос автора сохраняй: мат, иронию, резкость, обращение, один адресат и один род. Без тире и буквы «ё». Верни весь текст целиком, без пояснений.`
const ROLI_STROK = (t: string) => [...new Set((t.match(/^\s*[А-ЯЁ][\p{L} ]{0,24}:/gmu) || []).map(x => x.trim()))].sort().join('|')
const SMENY = (t: string) => (t.match(/^\s*\[смена\]\s*$/gmu) || []).length
export function popravitGuard(before: string, after: string, allowMat: boolean): string {
  if (!after.trim()) return 'пустой ответ'
  if (LABELS(after) !== LABELS(before)) return 'сломаны метки строк'
  if (ROLI_STROK(after) !== ROLI_STROK(before)) return 'сломаны роли или метки'
  if (SMENY(after) !== SMENY(before)) return 'сломаны экраны надписи'
  if (allowMat && hasMat(before) && !hasMat(after)) return 'пропал мат'
  return ''
}
export async function zh6Popravit(ctx: GenContext, text: string, prosba: string): Promise<{ text: string; used: boolean; reason?: string }> {
  const s = ctx.settings
  const fixed = remarki(finalNet(stripServiceTags(await callModel({ system: POPRAVIT_SYSTEM, user: `<текст>\n${text}\n</текст>\n\n<просьба>\n${prosba}\n</просьба>`, effort: 'low', verbosity: 'medium', maxTokens: 6000, timeoutMs: 60000, writer: true, userId: ctx.userId, operation: 'adjust_zh6', knownNames: s.knownNames }))))
  const out = allowMatOf(s) && matZvezdy(s) ? zvezdochki(fixed) : fixed
  const why = popravitGuard(text, out, allowMatOf(s))
  return why ? { text, used: false, reason: why } : { text: out, used: true }
}
