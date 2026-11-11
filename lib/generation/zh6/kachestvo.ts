// zh6, качество (11.11.2026, ветка fix/zh6-kachestvo): проверки кодом по замечаниям Арины к материалам etomath4.
// Каждая проверка отдает место на одну правку (как остальные находки write.ts mestaOf). Порог подобран так, чтобы
// на корпусе живых текстов (scripts/zh6/kachestvo-kalibr.ts: банки zh6, живые посты, расшифровки рилсов, карусели)
// проверка не срабатывала, а на сегодняшних текстах etomath4 ловила то, что отметила Арина.
import type { Mesto } from './checks'

const LABEL = /^\s*(?:Слайд \d+|Текст на экране|Речь|Подпись|Надпись|Экран \d+)\s*:\s*/u
const podpisOf = (t: string) => (t.match(/^\s*Подпись\s*:([\s\S]*)$/mu) || [])[1] || ''
const bezPodpisi = (t: string) => t.replace(/^\s*Подпись\s*:[\s\S]*$/mu, '')
const abzacy = (t: string) => t.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean)
const frazy = (t: string) => t.split(/(?<=[.!?…])\s+|\n+/u).map(x => x.replace(LABEL, '').trim()).filter(Boolean)
const slova = (t: string) => (t.toLowerCase().match(/[\p{L}]+/gu) || [])

// 1. Самопредставление по шаблону из профиля: «Я психолог, пишу о стрессе и выгорании», «Психолог, работаю с темой: ...».
// Живые представляются по-разному и редко; ловим только шаблон «психолог + пишу/работаю/помогаю + о/с/про» вне подписи
// (в тексте материала: на слайде, в речи, в теле поста), а в подписи, если представление в этот раз не просили.
const SAMO_RE = /(?<![\p{L}])(?:я\s+)?психолог\p{L}*[,\s]+(?:и\s+)?(?:пишу|работаю|помогаю|веду\s+блог|рассказываю)\s+(?:о|об|про|с|людям|женщинам|тем)(?![\p{L}])/iu
export function samopredstavlenie(text: string, o: { intro: boolean }): Mesto[] {
  const v = bezPodpisi(text).match(SAMO_RE)
  if (v) return [{ code: 'samopredstavlenie', quote: frazaS(text, v.index || 0), why: 'самопредставление по шаблону посреди материала: убери его, автор и так подписан; если представиться, то только в подписи и своими словами' }]
  if (!o.intro) {
    const p = podpisOf(text).match(SAMO_RE)
    if (p) return [{ code: 'samopredstavlenie', quote: frazaS(podpisOf(text), p.index || 0), why: 'представление по шаблону «я психолог, пишу о...»: в этот раз без него, просто договори подпись' }]
  }
  return []
}

// 2. Лекционная подводка к вопросам самому себе: «Здесь стоит присмотреться:», «задай себе пару вопросов».
// «Три вопроса, которые стоит задать себе» в заголовке живой карусели не ловим: только подводка посреди текста
const PODVODKA_RE = /(?:здесь|тут|сначала|для\s+начала)\s+стоит\s+(?:присмотреться|разобраться|задуматься)|задай(?:те)?\s+себе\s+(?:пару|несколько|такие|эти)\s+вопрос\p{L}*\s*:|спроси(?:те)?\s+себя\s+честно\s*:/iu
export function podvodka(text: string): Mesto[] {
  const m = text.match(PODVODKA_RE)
  return m ? [{ code: 'podvodka', quote: frazaS(text, m.index || 0), why: 'лекционная подводка к вопросам («стоит присмотреться»): скажи свою мысль прямо или задай один вопрос без подводки' }] : []
}

// 3. Вопросы-задания читателю после подводки с двоеточием: «Здесь стоит присмотреться: ...? ...? ...?». Цепочки
// вопросов без подводки у живых обычное дело (рилсы, споры с собой), поэтому их не трогаем: ловим только три и больше
// вопросов от пяти слов сразу после фразы, которая кончается двоеточием.
export function vopros3(text: string): Mesto[] {
  for (const a0 of abzacy(bezPodpisi(text))) {
    const a = a0.replace(/^\s*(?:Слайд \d+|Текст на экране|Речь|Надпись|Экран \d+)\s*:\s*/gmu, '')
    const k = a.search(/:\s+(?=[^\n]*\?)/u)
    if (k < 0 || /^\s*[А-ЯЁ][\p{L} ]{1,20}:\s/u.test(a.slice(Math.max(0, a.lastIndexOf('\n', k) + 1)))) continue
    const posle = frazy(a.slice(k + 1))
    let n = 0
    for (const f of posle) { if (/\?\s*$/.test(f) && slova(f).length >= 5) n++; else break }
    if (n >= 3) return [{ code: 'vopros3', quote: posle.slice(0, 3).join(' '), why: 'три вопроса-задания подряд после подводки, как в анкете: оставь один, самый точный, или скажи свою мысль утверждением' }]
  }
  return []
}

// 4. Оговорка про врача отдельным абзацем (часто с тройкой «и нагрузка, и сон, и здоровье»): оговорку оставляем, но
// одной фразой внутри соседнего абзаца. Ловим короткий абзац (до 45 слов) с безличной оговоркой, как из памятки
// («стоит обратиться к врачу», «причину не определить», «влияют и...»). Живое «сходи к врачу» не трогаем.
const VRACH_RE = /(?:стоит|следует|нужно|важно|лучше)\s+(?:обратиться|сходить|показаться)\s+к\s+(?:врачу|специалисту|терапевту)|обратиться\s+к\s+врачу|причин\p{L}*\s+(?:не\s+определить|может\s+быть\s+много)|(?:может|могут)\s+быть\s+связан\p{L}*\s+с\s+(?:здоровь|гормон|щитовид)/iu
export function vrachAbzac(text: string): Mesto[] {
  const ab = abzacy(bezPodpisi(text))
  if (ab.length < 3) return []
  for (const a of ab.slice(1)) {
    if (slova(a).length > 45 || !VRACH_RE.test(a)) continue
    return [{ code: 'vrach_abzac', quote: a.slice(0, 160), why: 'оговорка про врача отдельным абзацем, как из памятки: оставь ее одной короткой живой фразой внутри соседнего абзаца, без перечня причин' }]
  }
  return []
}

// 5. Сценка длиннее шести-восьми реплик: пинг-понг вопросами, мысль петляет. Считаем строки «Имя: реплика» в речи.
export const SCENKA_MAX = 8
export function scenkaDlinno(text: string, scene: boolean): Mesto[] {
  if (!scene) return []
  const SLUZH = /^(?:Речь|Подпись|Текст на экране|Надпись|Слайд \d+|Экран \d+)$/u
  const repl = bezPodpisi(text).split('\n')
    .map(l => l.replace(/^\s*Речь\s*:\s*/u, ''))
    .map(l => l.match(/^\s*([А-ЯЁ][\p{L}]*(?:\s[\p{L}]+){0,2}(?:\s*\([^)]{1,30}\))?)\s*:\s*\S/u))
    .filter((m): m is RegExpMatchArray => !!m && !SLUZH.test(m[1].trim()))
  if (repl.length <= SCENKA_MAX) return []
  return [{ code: 'scenka_dlinno', quote: `${repl.length} реплик`, why: `в сценке ${repl.length} реплик: оставь 5-6, одну линию; убери промежуточные вопросы психолога, поворот должен быть понятен зрителю без объяснения` }]
}

// 6. Противопоставление сцены и абстракции: «Отель на неделю, а готовность немедленно включиться осталась круглосуточно».
// Ловим «, а» + отглагольное или абстрактное существительное (-ость, -ние, -ство) в роли того, кто действует.
const ABSTR_RE = /,\s+а\s+((?:\p{L}+\s+){0,1}\p{L}+(?:ость|ности|ние|ния|ство))\s+(?:\p{L}+\s+){0,3}(?:остал\p{L}*|жив\p{L}*|работа\p{L}*|держ\p{L}*|продолжа\p{L}*|сид\p{L}*|ждет|никуда)/iu
export function abstrakciya(text: string): Mesto[] {
  const m = text.match(ABSTR_RE)
  return m ? [{ code: 'abstrakciya', quote: frazaS(text, m.index || 0), why: 'противопоставление сцены и абстракции: вместо отвлеченного слова скажи, что человек делает или чувствует, конкретно' }] : []
}

// 7. Тик «даже» в конце (11.11, решение Арины): «даже» в последней фразе текста или подписи чаще раза из трех по
// последним материалам автора. prev: отметки прошлых материалов по порядку (memory.ts zh6MemFromRows, dazhe).
const DAZHE = /(?<![\p{L}])даже(?![\p{L}])/iu
const poslednyaya = (t: string) => { const f = frazy(t); return f.length ? f[f.length - 1] : '' }
export function dazheVKonce(text0: string): boolean {
  let text = text0
  // старые карусели хранятся JSON-массивом слайдов
  if (text.trim().startsWith('[')) { try { text = (JSON.parse(text) as any[]).map(s => String(s?.text || '')).join('\n') } catch { /* как есть */ } }
  return DAZHE.test(poslednyaya(bezPodpisi(text))) || DAZHE.test(poslednyaya(podpisOf(text)))
}
export function dazheTik(text: string, prev: boolean[]): Mesto[] {
  if (!dazheVKonce(text) || !prev.slice(-2).some(Boolean)) return []
  const q = DAZHE.test(poslednyaya(bezPodpisi(text))) ? poslednyaya(bezPodpisi(text)) : poslednyaya(podpisOf(text))
  return [{ code: 'dazhe', quote: q, why: '«даже» в последней фразе уже было в прошлых текстах автора, это стало тиком: договори мысль без «даже» или оборви' }]
}

// 8. Рамка консультации в «Истории из кабинета» (11.11): «я бы обратила внимание», «я бы спросила», «в такой
// собирательной истории». Психолог говорит о своей работе уверенно, без условного «я бы» и без пометки «собирательная».
const RAMKA_RE = /(?<![\p{L}])я\s+бы\s+(?:обратил\p{L}*\s+внимание|спросил\p{L}*|предложил\p{L}*|заметил\p{L}*)|в\s+так(?:ой|их)\s+собирательн\p{L}*\s+истори\p{L}*|собирательн\p{L}*\s+истори\p{L}*/iu
export function ramkaKabineta(text: string, format6: string): Mesto[] {
  if (format6 !== 'post_kabinet') return []
  const m = text.match(RAMKA_RE)
  return m ? [{ code: 'ramka_kabineta', quote: frazaS(text, m.index || 0), why: 'рамка консультации («я бы обратила внимание», «собирательная история»): говори о своей работе прямо и уверенно, как о том, что видишь каждую неделю' }] : []
}

// 9. Обложка карусели длиннее 9 слов (11.11): первая строка слайда 1, подзаголовок строкой ниже не считается.
export const OBLOZHKA_MAX = 9
export function oblozhkaDlinno(text: string, carousel: boolean): Mesto[] {
  if (!carousel) return []
  const m = text.match(/^\s*Слайд\s*1\s*:\s*(.+)$/mu)
  if (!m) return []
  const n = slova(m[1]).length
  return n > OBLOZHKA_MAX ? [{ code: 'oblozhka', quote: m[1].trim(), why: `обложка ${n} слов: сократи до ${OBLOZHKA_MAX}, остальное можно отдать подзаголовку строкой ниже или следующему слайду` }] : []
}

// 10. Подпись пересказывает ролик или продолжает его сцену (11.11, решение Арины): больше половины значимых слов
// подписи уже есть в речи или надписях, или в подписи цепочка из трех слов мысли ядра (core.thought, core.quote).
// Живых подписей для калибровки мало (3 в банке zh6-primery), поэтому пороги осторожные.
const STOP = new Set(['этого', 'этому', 'потом', 'когда', 'только', 'тоже', 'чтобы', 'очень', 'просто', 'можно', 'нужно', 'тебя', 'себя', 'тебе', 'себе', 'меня', 'всего', 'всех', 'всегда', 'иногда', 'сейчас', 'теперь', 'опять', 'снова', 'будто', 'вроде', 'этот', 'этой', 'такой', 'такая', 'какой', 'какая', 'который', 'которая', 'потому', 'почему', 'если', 'даже', 'хоть', 'хотя', 'было', 'будет', 'есть', 'быть', 'уже', 'еще', 'свой', 'своя', 'свои', 'твой', 'твоя', 'твои'])
export const osnovy = (t: string) => new Set(slova(t).filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.slice(0, 5)))
const tri = (t: string) => { const w = slova(t); const out = new Set<string>(); for (let i = 0; i + 3 <= w.length; i++) if (w.slice(i, i + 3).some(x => x.length > 3)) out.add(w.slice(i, i + 3).join(' ')); return out }
export function podpisPereskaz(text: string, core?: { thought?: string; quote?: string }): Mesto[] {
  const pod = podpisOf(text).trim()
  if (!pod) return []
  const telo = bezPodpisi(text)
  const p = osnovy(pod), t = osnovy(telo)
  const obshie = [...p].filter(x => t.has(x)).length
  const triPod = tri(pod)
  // ревью 11.11: порог выше, у рилса подпись почти всегда делит слова темы с телом. Ловим цепочку из фразы для
  // цитаты, две цепочки из мысли ядра или 60% основ подписи в теле
  const izQuote = core?.quote ? [...tri(core.quote)].some(x => triPod.has(x)) : false
  const izMysli = core?.thought ? [...tri(core.thought)].filter(x => triPod.has(x)).length >= 2 : false
  if (izQuote || izMysli || (p.size >= 4 && obshie / p.size >= 0.6)) return [{ code: 'podpis_pereskaz', quote: pod.slice(0, 160), why: 'подпись пересказывает ролик или продолжает его сцену: дай то, чего в ролике нет (почему ты это сняла, как это у тебя в работе или жизни, или простой вопрос зрителю), без оценки ролика и без новых предметов' }]
  return []
}

// Надпись, повторяющая первую реплику, кодом не ловится (11.11): у живых это частый прием (в разборе рилсов
// надпись совпадает с первой фразой речи у трети роликов), поэтому только правило в NADPIS (formaty.ts).

function frazaS(text: string, at: number): string {
  const a = Math.max(text.lastIndexOf('.', at - 1), text.lastIndexOf('!', at - 1), text.lastIndexOf('?', at - 1), text.lastIndexOf('\n', at - 1)) + 1
  const ends = ['.', '!', '?', '\n'].map(c => text.indexOf(c, at + 1)).filter(x => x >= 0)
  const b = ends.length ? Math.min(...ends) + 1 : text.length
  return text.slice(a, b).replace(LABEL, '').trim()
}

// все проверки качества разом; intro: просили ли представиться в этот раз; scene: формат сценки; format6: код вида;
// carousel: карусель; prevDazhe: «даже» в конце прошлых материалов автора (по порядку, последний в конце)
export function kachestvoMesta(text: string, o: { intro: boolean; scene: boolean; format6?: string; carousel?: boolean; prevDazhe?: boolean[]; core?: { thought?: string; quote?: string } }): Mesto[] {
  return [...samopredstavlenie(text, o), ...podvodka(text), ...vopros3(text), ...vrachAbzac(text), ...scenkaDlinno(text, o.scene), ...abstrakciya(text),
    ...dazheTik(text, o.prevDazhe || []), ...ramkaKabineta(text, o.format6 || ''), ...oblozhkaDlinno(text, !!o.carousel), ...podpisPereskaz(text, o.core)]
}
