// Массовый прогон генерации с автооценкой и страницей для просмотра глазами.
// Это настоящие деньги: около 28 ₽ за материал (генерация, проверка, правки и оценка).
// Без --yes только печатает, сколько материалов и во сколько обойдется.
//
// Запуск в Терминале из папки проекта (нужен OPENAI_API_KEY в .env.local):
//   npx tsx --env-file=.env.local scripts/eval-batch.ts --yes                  все темы (около 38)
//   ... --n=12                              12 тем, поровну по форматам
//   ... --formats=post,post_tg,carousel     только эти форматы (reels = все виды Reels)
//   ... --ids=otvet_1,post_2                конкретные темы из scripts/eval-data.ts
//   ... --label=posle-pravki                подпись к папке, чтобы сравнивать прогоны
//   ... --model=gpt-5.4 / --writer=...      другая модель (см. lib/generation/ai.ts)
//   ... --no-judge                          без автооценки (дешевле на 10%)
//   ... --demo                              страница отчета на примерах, без модели и денег
//   ... --tema="выгорание у психолога"     своя тема: пост и рилс (--formats=post,reels_auto, --who=A|B|C, по умолчанию Ольга)
//   ... --dlya="девушки 20-27, зумеры"     другая аудитория у тестового психолога (материал профиля убирается)
//   ... --set=raznye                       16 тем на разные аудитории: мифы, «зачем мне психолог», отношения, родители, работа, мужчины
//   ... --golosa=rilsy                      голоса тестовых психологов из их рилсов (устная речь, у Ольги с матом),
//                                           а не из постов: test/samples/<A|B|C>_rilsy.md, слепок голоса строится один раз (около 30 ₽)
//   ... --kalibrovka                       оценка настоящих роликов из банка: какая планка у живых психологов
//   ... --cut-from=2026-09-30_18-05         только «Ножницы» по текстам готового прогона и новая оценка
//                                           (около 4 ₽ за материал): видно, что вычеркнуто и как изменилась оценка
//
// Результат: _знания/мозг-генератора/test/eval/<дата>_<подпись>/
//   report.html  открыть в браузере: все тексты, оценки, кнопки «Живо / Не живо» и заметка
//   summary.md   средние оценки по форматам, худшие тексты, частые нейро-маркеры
//   results.json все данные (план, черновик, итог, проверка, оценка) для Claude Code

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildAuthorSettings } from '../lib/generation/settings'
import { draft, refine, buildVoiceCore, type GenContext, type GenRequest } from '../lib/generation/pipeline'
import { callJson, modelFor } from '../lib/generation/ai'
import { extractOpening, guard, isReels, type FormatCode } from '../lib/generation/text-guard'
import type { Memory } from '../lib/generation/memory'
import { isSimpleMode, simpleWrite, cutText } from '../lib/generation/simple'
import { PERSONAS, TOPICS as TOPICS_BASE, TOPICS_RAZNYE, TOPICS_ROLI, TOPICS_KARUSELI, type EvalRow, type Who } from './eval-data'

const TEST = join(__dirname, '..', '_знания', 'мозг-генератора', 'test')
const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
const has = (name: string) => argv.includes(`--${name}`)
// --set=raznye: разные темы и аудитории (мифы, «зачем мне психолог», отношения, родители, работа, мужчины)
const TOPICS: EvalRow[] = flag('set') === 'raznye' ? TOPICS_RAZNYE : flag('set') === 'roli' ? TOPICS_ROLI : flag('set') === 'karuseli' ? TOPICS_KARUSELI : TOPICS_BASE
if (flag('model')) process.env.GENERATION_MODEL = flag('model')
if (flag('writer')) process.env.GENERATION_WRITER_MODEL = flag('writer')

// ---------- автооценка ----------
const JUDGE_SYSTEM = `Ты строгий читатель и редактор блога психолога. Тебе дают готовый материал (пост, карусель, сценарий Reels или сторис) и кто его автор. Оцени так, как оценил бы живой подписчик из аудитории автора и опытный редактор, который ненавидит тексты от нейросети.

Главный вопрос: подписчик досмотрит или дочитает до конца, сохранит или перешлет подруге? И захочет ли он к этому психологу: видно ли, что автор свой, говорит просто, такой, какой есть, понимает изнутри, как человеку сейчас, и правда хочет помочь, а не умничает и не позирует. Живые ролики психологов, которые собрали много сохранений, это 4-5, хотя в них есть корявости, упрощения и резкость.
Ты не цензор и не этический комитет. Резкие, категоричные и спорные утверждения, ирония, подколки, мат, упрощения это норма для блога и часто именно то, что залетает. Не снижай оценки и не называй это худшим местом за «слишком уверенное обобщение», «звучит как упрек», «упрощает», «нельзя знать наверняка». Минус только если это по сути неправда, опасно (диагноз, совет бросить лечение) или унижает читателя.

Оценки от 1 до 5 (5 лучше). Средний гладкий текст нейросети это 2-3.
- zhivo: звучит как живой человек говорит или пишет от себя. 1: гладко, правильно, безлико, как нейросеть. 5: слышен конкретный человек с характером.
- zacep: первая строка или первые 2 секунды ролика остановят человека из аудитории в ленте. 1: тема или вывод. 5: узнал себя сразу.
- ponyatno: человек без психологического образования понимает с первого раза, нет абстракций и терминов без перевода, нет странных образов.
- polza: читатель что-то уносит: узнал себя, понял, почему так, хочет сохранить или переслать близкому.
- interesno: главный вопрос. Человек из аудитории говорит «это прям я» и «блин, реально, а я столько лет не понимала, что это»: узнал свое и понял про себя новое. 1: все это он и так знал или слышал от психологов, общие слова, разжевано. 3: узнал себя, но нового не понял. 5: узнал себя и понял новое, хочется переслать подруге со словами «это про нас».
- snyat: только для Reels. Психолог без опыта съемки по этому тексту снимет ролик сегодня, речь легко говорить вслух, понятно, что в кадре. Для остальных форматов null.

ai_markers: дословные цитаты мест, по которым видно нейросеть: «не X, а Y» в любой форме, пафос, мини-вывод, рубленые фразы подряд, одушевление, канцелярит, книжные слова, мораль в конце, открыточная поддержка, тире. И отдельно кальки: фразы, которые по-русски так не говорят (перевод с английского, психологический термин в лоб, странный порядок слов, «люди, которые всегда в голове», «это ок», «дать себе разрешение»). Читай каждую фразу как носитель языка на кухне. Не больше 8, каждая до 15 слов. Пусто, если нет.
Мат: если автор матерится, мат на эмоции это живая речь, в том числе отдельным восклицанием в начале фразы («Бл*ть, ...», «Сука, ...»). Не ставь его в ai_markers и не считай «добавленным для дерзости». Минус только если мат в каждой второй фразе или он у автора, который не матерится.
worst: одна самая слабая фраза дословно и почему, коротко.
best: одна самая живая фраза дословно, или пусто.
verdict: "publikovat" (подписчик досмотрит и захочет сохранить или переслать; одна-две корявые фразы не мешают, у живых роликов они тоже есть), "popravit" (основа есть, но что-то мешает досмотреть, понять или поверить), "v_korzinu" (скучно, непонятно, звучит как нейросеть или вредно).
why: одна-две фразы, почему такой вердикт.

Эталон (настоящие ролики психологов, которые собрали много сохранений; так выглядит 5 по «живо» и «интересно»):
<эталон 1>__E1__</эталон 1>
<эталон 2>__E2__</эталон 2>
Сравнивай с эталоном по живости и смелости, а не по теме и длине.

Ответ только JSON: {"zhivo":3,"zacep":3,"ponyatno":3,"polza":3,"interesno":3,"snyat":null,"ai_markers":[],"worst":"","best":"","verdict":"popravit","why":""}`

type Judge = { zhivo: number; zacep: number; ponyatno: number; polza: number; interesno: number; snyat: number | null; ai_markers: string[]; worst: string; best: string; verdict: string; why: string }

import { LIVE_EXAMPLES } from '../lib/generation/examples'
const anchor = (id: string) => LIVE_EXAMPLES.find(e => e.id === id)?.text || ''
const JUDGE = JUDGE_SYSTEM.replace('__E1__', anchor('m45')).replace('__E2__', anchor('r38'))

async function judge(row: EvalRow, format: FormatCode, text: string, neutral = false): Promise<Judge | null> {
  const p = PERSONAS[row.who]
  const user = neutral ? `Автор: психолог, ведет блог в Instagram. Аудитория: подписчики психолога, в основном женщины 20-45.
Формат: ${format} (Reels, это расшифровка живого ролика, корявости устной речи и распознавания не считай минусом).

<материал>
${text}
</материал>` : `Автор: ${p.full_name}, ${p.author_gender === 'male' ? 'психолог-мужчина' : 'психолог-женщина'}, подход ${p.approaches.join(', ')}, пишет про: ${row.dlya || flag('dlya') || p.one_niche}. Аудитория: ${row.dlya || flag('dlya') || p.audience}. Мат: ${p.profanity === 'no' ? 'не использует' : 'использует'}.
Формат: ${format}${isReels(format) ? ' (Reels, это текст для съемки)' : ''}. Тема: ${row.topic}.

<материал>
${text}
</материал>`
  try {
    return await callJson<Judge>({ system: JUDGE, user, effort: 'medium', verbosity: 'low', maxTokens: 3000, operation: 'eval_judge' })
  } catch (e: any) {
    console.warn(`оценка ${row.id} не вышла: ${e?.message || e}`)
    return null
  }
}

// ---------- выбор тем ----------
function pickRows(): EvalRow[] {
  // --tema="своя тема": разовая генерация на свою тему (по умолчанию пост и рилс, психолог Ольга)
  const tema = flag('tema')
  if (tema) {
    const who = (['A', 'B', 'C'].includes(flag('who')) ? flag('who') : 'B') as Who
    const fmts = (flag('formats') || 'post,reels_auto').split(',').filter(Boolean) as FormatCode[]
    return fmts.map((format, i) => ({ id: `tema_${i + 1}`, who, intent: flag('intent') || 'uznavanie', format, topic: tema }))
  }
  let rows = TOPICS
  const ids = flag('ids').split(',').filter(Boolean)
  if (ids.length) rows = rows.filter(r => ids.includes(r.id))
  const formats = flag('formats').split(',').filter(Boolean)
  if (formats.length && !ids.length) rows = rows.filter(r => formats.includes(r.format) || (formats.includes('reels') && isReels(r.format)))
  const n = ids.length ? 0 : Number(flag('n')) || 0
  if (n && n < rows.length) {
    // поровну по форматам: по одной теме из каждого формата по кругу
    const groups = new Map<string, EvalRow[]>()
    for (const r of rows) groups.set(r.format, [...(groups.get(r.format) || []), r])
    const out: EvalRow[] = []
    for (let i = 0; out.length < n; i++) {
      let added = false
      for (const g of groups.values()) if (g[i] && out.length < n) { out.push(g[i]); added = true }
      if (!added) break
    }
    rows = out
  }
  // --as=post|post_tg|carousel: те же темы другим форматом (для чтения глазами, судья такие не меряет)
  if (flag('as')) rows = rows.map(r => ({ ...r, format: flag('as') as FormatCode, id: `${r.id}_${flag('as')}` }))
  // --only-reels: все темы как рилсы (пост, ТГ и карусель становятся reels_auto), список тем тот же
  if (has('only-reels')) rows = rows.map(r => (isReels(r.format) ? r : { ...r, format: 'reels_auto' as FormatCode }))
  // --per=2: по два текста на тему (второй с суффиксом _2, память ленты сдвинута, поэтому вид и примеры другие)
  const per = Number(flag('per')) || 1
  if (per > 1) rows = rows.flatMap(r => Array.from({ length: per }, (_, k) => (k ? { ...r, id: `${r.id}_${k + 1}` } : r)))
  return rows
}

const emptyMemory = (): Memory => ({ count: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [] })

// --golosa=rilsy: образцы голоса из транскриптов рилсов вместо постов
const VOICE = flag('golosa') === 'rilsy' ? '_rilsy' : ''
function samplesOf(who: string): string[] {
  const md = readFileSync(join(TEST, 'samples', VOICE ? `${who}${VOICE}.md` : `${who}_obrazcy.md`), 'utf8')
  return md.split(/^## Образец \d+\s*$/m).slice(1).map(s => s.trim()).filter(Boolean)
}

type Core = { core: string; sig: string[]; fit: (boolean | null)[]; samples: string[] }
async function coreOf(who: Who): Promise<Core> {
  const file = join(TEST, 'eval', `voice_core_${who}${VOICE}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const old = join(TEST, 'reels-v35', `voice_core_${who}.json`)
  if (!VOICE && existsSync(old)) { writeFileSync(file, readFileSync(old)); return JSON.parse(readFileSync(old, 'utf8')) }
  console.log(`слепок голоса ${who}...`)
  const r = await buildVoiceCore('', samplesOf(who), [PERSONAS[who].full_name])
  const c = { core: r.voiceCore, sig: r.signatures, fit: r.fit, samples: r.cleaned }
  writeFileSync(file, JSON.stringify(c))
  return c
}

type Result = {
  id: string; who: Who; author: string; intent: string; asked_format: string; format: string; topic: string
  seconds: number; text: string; draft: string; plan: any; review: any; fixes: number; rewritten: boolean
  guard: { rule: string; quote: string }[]; judge: Judge | null; error?: string
  cut?: string[]; judge_before?: Judge | null
}

async function runOne(row: EvalRow, memory: Memory, core: Core): Promise<Result> {
  // --dlya="девушки 20-27, зумеры": другая аудитория у тестового психолога; материал профиля (фразы клиентов,
  // позиция, истории) убираем, иначе он тянет старые темы (у Ольги муж и дети)
  const dlya = row.dlya || flag('dlya')
  const p = dlya ? { ...PERSONAS[row.who], audience: dlya, one_niche: dlya, client_pain_phrases: '', position_text: '', story_bank: [] } : PERSONAS[row.who]
  const profile = { ...p, voice_core: core.core, signature_phrases: core.sig, voice_samples: core.samples.map((text, i) => ({ text, fit: core.fit[i], source: 'pasted' })) }
  const ctx: GenContext = { userId: '', settings: buildAuthorSettings(profile, { rotation: memory.count }), memory }
  const req: GenRequest = { topic: row.topic, format: row.format, intent: row.intent }
  const base = { id: row.id, who: row.who, author: p.full_name, intent: row.intent, asked_format: row.format, topic: row.topic }
  const t0 = Date.now()
  try {
    // простой путь (по умолчанию в продукте): один вызов, без плана и проверок
    if (isSimpleMode()) {
      const r = await simpleWrite(ctx, req)
      memory.count++
      memory.lastIntents.unshift(r.intent)
      memory.lastFormats.unshift(r.format)
      const g = guard(r.text, { format: r.format })
      const j = has('no-judge') ? null : await judge(row, r.format, r.text)
      return { ...base, format: r.format, seconds: Math.round((Date.now() - t0) / 1000), text: r.text, draft: r.draft, cut: r.cut, plan: { intent: r.intent }, review: null, fixes: 0, rewritten: false, guard: g.findings, judge: j }
    }
    let d = await draft(ctx, req)
    if (d.kind === 'need_detail') d = await draft(ctx, req, { plan: d.plan, skipDetail: true })
    if (d.kind !== 'text') throw new Error('план не дал текста')
    const r = await refine(ctx, d.plan, req, d.text, d.findings)
    memory.count++
    if (d.plan.hook_type) memory.lastHookTypes.unshift(d.plan.hook_type)
    if (d.plan.arc) memory.lastArcs.unshift(d.plan.arc)
    memory.lastOpenings.unshift(extractOpening(r.text, req.format))
    if (d.plan.ending_type) memory.lastEndings.unshift(d.plan.ending_type)
    memory.lastRings.unshift(d.plan.ring === true)
    memory.lastIntents.unshift(d.plan.intent)
    memory.lastFormats.unshift(req.format)
    if (d.plan.detail) memory.usedDetails.unshift(d.plan.detail)
    memory.recentTopics.unshift(d.plan.topic_for_text)
    const g = guard(r.text, { format: req.format })
    const j = has('no-judge') ? null : await judge(row, req.format, r.text)
    return { ...base, format: req.format, seconds: Math.round((Date.now() - t0) / 1000), text: r.text, draft: d.text, plan: d.plan, review: r.review, fixes: r.fixes, rewritten: r.rewritten, guard: g.findings, judge: j }
  } catch (e: any) {
    return { ...base, format: row.format, seconds: Math.round((Date.now() - t0) / 1000), text: '', draft: '', plan: null, review: null, fixes: 0, rewritten: false, guard: [], judge: null, error: String(e?.message || e) }
  }
}

// ---------- отчеты ----------
const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0)
const score = (j: Judge | null) => (j ? avg([j.zhivo, j.zacep, j.ponyatno, j.polza, ...(j.interesno ? [j.interesno] : []), ...(j.snyat ? [j.snyat] : [])]) : 0)

function summary(results: Result[], meta: string): string {
  const ok = results.filter(r => !r.error)
  const lines = [`# Прогон ${meta}`, '', `Материалов: ${results.length}, ошибок: ${results.length - ok.length}.`, '']
  const judged = ok.filter(r => r.judge)
  if (judged.length) {
    const v = (k: string) => judged.filter(r => r.judge!.verdict === k).length
    lines.push(`Вердикты: публиковать ${v('publikovat')}, поправить ${v('popravit')}, в корзину ${v('v_korzinu')}.`, '')
    const before = judged.filter(r => r.judge_before)
    if (before.length) {
      const vb = (k: string) => before.filter(r => r.judge_before!.verdict === k).length
      lines.push(`До ножниц: средняя ${avg(before.map(r => score(r.judge_before!)))}, после ${avg(before.map(r => score(r.judge)))}. Вердикты до: публиковать ${vb('publikovat')}, поправить ${vb('popravit')}, в корзину ${vb('v_korzinu')}.`, '')
    }
    const withCut = ok.filter(r => r.cut && r.cut.length)
    if (withCut.length) lines.push(`Ножницы вычеркнули что-то в ${withCut.length} из ${ok.length}, всего фраз: ${withCut.reduce((n, r) => n + r.cut!.length, 0)}.`, '')
    lines.push('| Формат | Штук | Живо | Цепляет | Понятно | Польза | Интересно | Снять | Средняя |', '|---|---|---|---|---|---|---|---|---|')
    const formats = [...new Set(judged.map(r => r.format))]
    for (const f of formats) {
      const g = judged.filter(r => r.format === f).map(r => r.judge!)
      const sn = g.map(x => x.snyat).filter((x): x is number => typeof x === 'number')
      lines.push(`| ${f} | ${g.length} | ${avg(g.map(x => x.zhivo))} | ${avg(g.map(x => x.zacep))} | ${avg(g.map(x => x.ponyatno))} | ${avg(g.map(x => x.polza))} | ${avg(g.map(x => x.interesno || 0))} | ${sn.length ? avg(sn) : ''} | ${avg(g.map(x => score(x)))} |`)
    }
    const all = judged.map(r => r.judge!)
    lines.push(`| все | ${all.length} | ${avg(all.map(x => x.zhivo))} | ${avg(all.map(x => x.zacep))} | ${avg(all.map(x => x.ponyatno))} | ${avg(all.map(x => x.polza))} | ${avg(all.map(x => x.interesno || 0))} | | ${avg(all.map(x => score(x)))} |`, '')
    lines.push('## Худшие', '')
    for (const r of [...judged].sort((a, b) => score(a.judge) - score(b.judge)).slice(0, 8)) {
      lines.push(`- ${r.id} (${r.format}, ${score(r.judge)}): ${r.judge!.why} Худшее: ${r.judge!.worst}`)
    }
    lines.push('', '## Нейро-маркеры, которые нашла оценка', '')
    for (const r of judged) for (const m of r.judge!.ai_markers || []) lines.push(`- ${r.id}: «${m}»`)
  }
  const guardCount: Record<string, number> = {}
  for (const r of ok) for (const f of r.guard) guardCount[f.rule] = (guardCount[f.rule] || 0) + 1
  lines.push('', '## Что осталось в итоговых текстах по проверке кодом', '')
  for (const [k, n] of Object.entries(guardCount).sort((a, b) => b[1] - a[1])) lines.push(`- ${k}: ${n}`)
  const errs = results.filter(r => r.error)
  if (errs.length) { lines.push('', '## Ошибки', ''); for (const r of errs) lines.push(`- ${r.id}: ${r.error}`) }
  return lines.join('\n')
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// описание к публикации (метка «Подпись:») показываем отдельно от текста, как в приложении
function splitCap(text: string): { body: string; caption: string } {
  const m = String(text || '').match(/(^|\n)\s*Подпись\s*:\s*/u)
  if (!m || m.index === undefined) return { body: text, caption: '' }
  return { body: text.slice(0, m.index).trimEnd(), caption: text.slice(m.index + m[0].length).trim() }
}

function reportHtml(results: Result[], meta: string, runId: string): string {
  const data = JSON.stringify(results.map(r => ({ id: r.id, author: r.author, format: r.format, asked: r.asked_format, intent: r.intent, topic: r.topic, text: splitCap(r.text).body, caption: splitCap(r.text).caption, judge: r.judge, guard: r.guard, error: r.error, hook: r.plan?.hook_type, arc: r.plan?.arc, cut: r.cut || [], before: r.judge_before || null }))).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Прогон ${esc(meta)}</title>
<style>
:root{--bg:#F7F3EC;--ink:#2E2A45;--muted:#6B6680;--acc:#5B4FA0;--soft:#E7E2F2;--sage:#8F9D68;--line:#E4DED2;--bad:#B4533F}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px;z-index:2}
h1{font-size:18px;margin:0 0 8px}.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
select,button,input{font:inherit;border:1px solid var(--line);background:#fff;border-radius:10px;padding:6px 10px;color:var(--ink)}
button{cursor:pointer}button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
main{max-width:1100px;margin:0 auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px}
.meta{font-size:12px;color:var(--muted)}.tag{display:inline-block;font-size:12px;padding:1px 8px;border-radius:8px;background:var(--soft);margin-right:4px}
.v-publikovat{background:#E3EAD2}.v-popravit{background:#F3E7C9}.v-v_korzinu{background:#F2D6CF}
pre{white-space:pre-wrap;font:inherit;margin:0;max-height:420px;overflow:auto;border-left:3px solid var(--soft);padding-left:10px}
.scores{display:flex;gap:6px;flex-wrap:wrap;font-size:12px}.scores span{border:1px solid var(--line);border-radius:8px;padding:1px 6px}
.why{font-size:13px;color:var(--muted)}.mk{font-size:12px;color:var(--bad)}.cut{font-size:13px;color:var(--muted)}.cap{font-size:14px;background:var(--soft);border-radius:10px;padding:8px 10px;white-space:pre-wrap}.cut s{color:var(--bad)}
.rate{display:flex;gap:6px;align-items:center}.rate input{flex:1;min-width:0}
.hidden{display:none}
</style></head><body>
<header><h1>Прогон ${esc(meta)}</h1><div class="bar">
<select id="f"><option value="">все форматы</option></select>
<select id="v"><option value="">все вердикты</option><option value="publikovat">публиковать</option><option value="popravit">поправить</option><option value="v_korzinu">в корзину</option><option value="mine">я еще не оценила</option></select>
<span id="cnt" class="meta"></span>
<button id="dl">Скачать мои оценки</button></div></header>
<main id="m"></main>
<script>
const DATA=${data};const KEY='eval-${runId}';
let R={};try{R=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(R))}catch(e){}};
const V={publikovat:'публиковать',popravit:'поправить',v_korzinu:'в корзину'};
const fs=[...new Set(DATA.map(d=>d.format))];const fsel=document.getElementById('f');
fs.forEach(x=>{const o=document.createElement('option');o.value=x;o.textContent=x;fsel.appendChild(o)});
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function render(){const f=fsel.value,v=document.getElementById('v').value;const m=document.getElementById('m');m.innerHTML='';let n=0;
DATA.forEach(d=>{const j=d.judge||{};if(f&&d.format!==f)return;if(v==='mine'&&R[d.id]&&R[d.id].mark)return;if(v&&v!=='mine'&&j.verdict!==v)return;n++;
const c=document.createElement('div');c.className='card';const r=R[d.id]||{};
c.innerHTML='<div class="meta"><b>'+esc(d.id)+'</b> · '+esc(d.author)+' · '+esc(d.format)+(d.asked!==d.format?' (просили '+esc(d.asked)+')':'')+' · '+esc(d.intent)+'<br>'+esc(d.topic)+'</div>'
+(d.error?'<div class="mk">Ошибка: '+esc(d.error)+'</div>':'')
+(j.verdict?'<div><span class="tag v-'+j.verdict+'">'+V[j.verdict]+'</span><span class="why">'+esc(j.why)+'</span></div>':'')
+(j.zhivo?'<div class="scores"><span>живо '+j.zhivo+'</span><span>цепляет '+j.zacep+'</span><span>понятно '+j.ponyatno+'</span><span>польза '+j.polza+'</span>'+(j.interesno?'<span>интересно '+j.interesno+'</span>':'')+(j.snyat?'<span>снять '+j.snyat+'</span>':'')+'</div>':'')
+(d.before?'<div class="meta">до ножниц: '+V[d.before.verdict]+', живо '+d.before.zhivo+', интересно '+(d.before.interesno||'')+'</div>':'')
+'<pre>'+esc(d.text)+'</pre>'
+(d.caption?'<div class="cap"><b>Описание к публикации</b><br>'+esc(d.caption)+'</div>':'')
+((d.cut||[]).length?'<div class="cut">Вычеркнула: '+d.cut.map(x=>'<s>'+esc(x)+'</s>').join(' ')+'</div>':'')
+((j.ai_markers||[]).length?'<div class="mk">'+j.ai_markers.map(x=>'«'+esc(x)+'»').join(' ')+'</div>':'')
+(j.worst?'<div class="why">Худшее: '+esc(j.worst)+'</div>':'')
+((d.guard||[]).length?'<div class="meta">Код нашел: '+d.guard.map(g=>esc(g.rule)).join(', ')+'</div>':'')
+'<div class="rate"><button data-m="ok" class="'+(r.mark==='ok'?'on':'')+'">Живо</button><button data-m="bad" class="'+(r.mark==='bad'?'on':'')+'">Не живо</button><input placeholder="что не так" value="'+esc(r.note||'')+'"></div>';
c.querySelectorAll('button[data-m]').forEach(b=>b.onclick=()=>{R[d.id]={...(R[d.id]||{}),mark:b.dataset.m};save();render()});
c.querySelector('input').onchange=e=>{R[d.id]={...(R[d.id]||{}),note:e.target.value};save()};
m.appendChild(c)});document.getElementById('cnt').textContent=n+' шт.'}
fsel.onchange=render;document.getElementById('v').onchange=render;
document.getElementById('dl').onclick=()=>{const b=new Blob([JSON.stringify({run:KEY,ratings:R},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ocenki-${runId}.json';a.click()};
render();
</script></body></html>`
}

// ---------- запуск ----------
async function main() {
  const rows = pickRows()
  // --demo: проверка страницы отчета без модели и без денег (тексты из банка живых роликов, оценки случайные)
  if (has('demo')) {
    const { LIVE_EXAMPLES } = await import('../lib/generation/examples')
    const out = join(TEST, 'eval', 'demo')
    mkdirSync(out, { recursive: true })
    const fake: Result[] = rows.slice(0, 8).map((r, i) => {
      const ex = LIVE_EXAMPLES[i % LIVE_EXAMPLES.length]
      const n = (k: number) => 2 + ((i + k) % 4)
      return { id: r.id, who: r.who, author: PERSONAS[r.who].full_name, intent: r.intent, asked_format: r.format, format: r.format === 'reels_auto' ? 'reels_monolog' : r.format, topic: r.topic, seconds: 0, text: ex.text, draft: '', plan: { hook_type: 'golos_chitatelya' }, review: null, fixes: 0, rewritten: false, guard: guard(ex.text, { format: r.format }).findings, judge: { zhivo: n(0), zacep: n(1), ponyatno: n(2), polza: n(3), interesno: n(2), snyat: isReels(r.format) ? n(1) : null, ai_markers: i % 3 ? [] : ['пример маркера'], worst: 'демо', best: '', verdict: ['publikovat', 'popravit', 'v_korzinu'][i % 3], why: 'Демо-оценка, не настоящая.' } }
    })
    writeFileSync(join(out, 'summary.md'), summary(fake, 'демо'))
    writeFileSync(join(out, 'report.html'), reportHtml(fake, 'демо (тексты из банка, оценки ненастоящие)', 'demo'))
    console.log(`Демо: ${join(out, 'report.html')}`)
    return
  }
  // --kalibrovka: та же оценка по настоящим роликам из банка (не по эталонам из самой оценки).
  // Показывает, сколько «публиковать» оценщик ставит живым психологам: это и есть планка для наших текстов.
  if (has('kalibrovka')) {
    const { LIVE_EXAMPLES: bank } = await import('../lib/generation/examples')
    const n = Number(flag('n')) || 12
    const list = bank.filter(e => e.id !== 'm45' && e.id !== 'r38').slice(0, n)
    console.log(`Калибровка: оценщик читает ${list.length} настоящих роликов из банка. Оценка: около ${list.length * 3 + 5} ₽.`)
    if (!has('yes')) { console.log('Это настоящие деньги. Запусти с --yes, если согласна.'); return }
    const runId = `${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}_kalibrovka`
    const out = join(TEST, 'eval', runId)
    mkdirSync(out, { recursive: true })
    const results: Result[] = []
    const queue = [...list]
    await Promise.all([0, 1, 2, 3].map(async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        const who: Who = e.mat ? 'B' : 'A'
        const row: EvalRow = { id: e.id, who, intent: e.intents[0] || 'uznavanie', format: e.format, topic: e.text.replace(/^[^:\n]*:\s*/, '').slice(0, 70) }
        const j = await judge(row, e.format, e.text, true)
        results.push({ id: e.id, who, author: 'живой ролик', intent: row.intent, asked_format: e.format, format: e.format, topic: row.topic, seconds: 0, text: e.text, draft: '', plan: null, review: null, fixes: 0, rewritten: false, guard: [], judge: j })
        console.log(`${e.id}: ${j ? `${j.verdict}, живо ${j.zhivo}, интересно ${j.interesno}` : 'оценка не вышла'}`)
      }
    }))
    const ordered = list.map(e => results.find(r => r.id === e.id)).filter(Boolean) as Result[]
    writeFileSync(join(out, 'results.json'), JSON.stringify(ordered, null, 2))
    writeFileSync(join(out, 'summary.md'), summary(ordered, `${runId}, настоящие ролики`))
    writeFileSync(join(out, 'report.html'), reportHtml(ordered, `${runId}, настоящие ролики`, runId))
    console.log(`\nГотово. Открой отчет: open "${join(out, 'report.html')}"`)
    console.log(readFileSync(join(out, 'summary.md'), 'utf8').split('\n').slice(0, 20).join('\n'))
    return
  }
  // --cut-from: ножницы по текстам готового прогона и новая оценка, генерации нет
  if (flag('cut-from')) {
    const src = join(TEST, 'eval', flag('cut-from'), 'results.json')
    if (!existsSync(src)) throw new Error(`Нет прогона ${src}`)
    const prev: Result[] = JSON.parse(readFileSync(src, 'utf8')).filter((r: Result) => !r.error && r.text)
    console.log(`Ножницы по прогону ${flag('cut-from')}: ${prev.length} материалов. Оценка: около ${prev.length * 4 + 5} ₽, время около ${Math.ceil(prev.length / 4)} мин.`)
    if (!has('yes')) { console.log('Это настоящие деньги. Запусти с --yes, если согласна.'); return }
    if (!process.env.OPENAI_API_KEY) throw new Error('Нет OPENAI_API_KEY в .env.local')
    const runId = `${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}_nozhnicy`
    const out = join(TEST, 'eval', runId)
    mkdirSync(out, { recursive: true })
    const meta = `${runId}, ножницы по ${flag('cut-from')}, ${modelFor(true)}`
    const results: Result[] = []
    const queue = [...prev]
    await Promise.all([0, 1, 2, 3].map(async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const row = TOPICS.find(t => t.id === r!.id) || { id: r.id, who: r.who, intent: r.intent, format: r.format as FormatCode, topic: r.topic }
        const c = await cutText({ userId: '' } as GenContext, r.format as FormatCode, r.text)
        const j = c.cut.length ? await judge(row, r.format as FormatCode, c.text) : r.judge
        results.push({ ...r, draft: r.text, text: c.text, cut: c.cut, guard: guard(c.text, { format: r.format as FormatCode }).findings, judge: j, judge_before: r.judge })
        console.log(`${r.id}: вычеркнуто ${c.cut.length}${c.cut.length && j ? `, было ${r.judge?.verdict} ${score(r.judge)}, стало ${j.verdict} ${score(j)}` : ''}`)
        const ordered = prev.map(p => results.find(x => x.id === p.id)).filter(Boolean) as Result[]
        writeFileSync(join(out, 'results.json'), JSON.stringify(ordered, null, 2))
        writeFileSync(join(out, 'summary.md'), summary(ordered, meta))
        writeFileSync(join(out, 'report.html'), reportHtml(ordered, meta, runId))
      }
    }))
    console.log(`\nГотово. Открой отчет: open "${join(out, 'report.html')}"`)
    console.log(readFileSync(join(out, 'summary.md'), 'utf8').split('\n').slice(0, 8).join('\n'))
    return
  }
  const perItem = isSimpleMode() ? (has('no-judge') ? 7 : 10) : has('no-judge') ? 30 : 33
  console.log(`Режим: ${isSimpleMode() ? 'простой путь' : 'полная цепочка'}. Модель: ${modelFor(true)}.`)
  console.log(`Материалов: ${rows.length}. Оценка: около ${rows.length * perItem + 30 + (VOICE ? 30 : 0)} ₽, время около ${Math.ceil(rows.length / 3) * 1.5} мин.`)
  if (!has('yes')) { console.log('Это настоящие деньги. Запусти с --yes, если согласна.'); return }
  if (!process.env.OPENAI_API_KEY) throw new Error('Нет OPENAI_API_KEY в .env.local')

  // до секунд: прогоны в цикле по психологам иначе попадают в одну минуту и затирают друг друга
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const runId = `${stamp}${VOICE}${flag('label') ? '_' + flag('label') : ''}`
  const out = join(TEST, 'eval', runId)
  mkdirSync(out, { recursive: true })
  const meta = `${runId}, текст ${modelFor(true)}`

  // у каждого психолога своя очередь (память ленты копится по порядку), психологи идут параллельно
  const results: Result[] = []
  const byWho = new Map<Who, EvalRow[]>()
  for (const r of rows) byWho.set(r.who, [...(byWho.get(r.who) || []), r])
  await Promise.all([...byWho.entries()].map(async ([who, list]) => {
    const core = await coreOf(who)
    const memory = emptyMemory()
    // своя тема: память ленты как будто не с нуля, иначе скелет, призыв и материал каждый раз одни и те же
    if (flag('tema')) memory.count = Math.floor(Math.random() * 12)
    for (const row of list) {
      const res = await runOne(row, memory, core)
      results.push(res)
      const j = res.judge
      console.log(`${res.id}: ${res.error ? 'ОШИБКА ' + res.error.slice(0, 120) : `${res.format}, ${res.seconds} с${j ? `, ${j.verdict}, живо ${j.zhivo}` : ''}`}`)
      const ordered = rows.map(r => results.find(x => x.id === r.id)).filter(Boolean) as Result[]
      writeFileSync(join(out, 'results.json'), JSON.stringify(ordered, null, 2))
      writeFileSync(join(out, 'summary.md'), summary(ordered, meta))
      writeFileSync(join(out, 'report.html'), reportHtml(ordered, meta, runId))
    }
  }))
  console.log(`\nГотово. Открой отчет: open "${join(out, 'report.html')}"`)
  console.log(readFileSync(join(out, 'summary.md'), 'utf8').split('\n').slice(0, 20).join('\n'))
}

main().catch(e => { console.error(e); process.exit(1) })
