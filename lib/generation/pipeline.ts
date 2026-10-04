// Новая цепочка генерации (03-PROMPTY.md, 02-ARHITEKTURA.md):
// П1 план → П2 текст → П3 код → П4 проверка → П5 правка → П4-мини и П3 по измененному → finalNet.
// Первая часть (draft) отдается психологу сразу, вторая (refine) идет фоном и подменяет текст.

import {
  INTENT_CARDS, FORMAT_CARDS, INTENT_CODES, BUTTONS, P0_SYSTEM, P1_SYSTEM, P4_SYSTEM,
  buildP1User, buildP2System, buildP2User, buildP4User, buildP4MiniUser, buildP5System, buildP5User,
  buildP6, buildP8, buildP2V, buildP2P, P2P_SYSTEM, allowedHooksWithDescriptions, buildP0User,
} from './prompts'
import { callModel, callJson } from './ai'
import { autofix, finalNet, guard, extractOpening, findSignatures, cleanSample, isReels, REELS_FORMATS, type FormatCode, type GuardFinding } from './text-guard'
import { pickExamples, examplesText, type LiveExample } from './examples'
import { relevantStories, storiesText, parseSignatures, parseSampleFit, type AuthorSettings } from './settings'
import { memoryVars, type Memory } from './memory'

export const PIPELINE_VERSION = 'v3.5'

export type Plan = {
  reader_state?: string
  intent: string
  requested_intent?: string | null
  need_detail?: string | null
  topic_for_text: string
  funnel?: string
  one_idea?: string
  translation?: { term: string; as_lived: string[] }[]
  author_term?: string | null
  material?: string
  client_phrase_used?: string | null
  hook_type?: string
  hook_idea?: string
  delivery?: string
  arc?: string
  detail?: string
  ending_type?: string
  ring?: boolean
  length?: string | null
  pain_from_feed?: string | null
  reels_format?: string | null   // вид рилса, если просили «Подбери сама»
  risks?: string[]
}

export type Check = { id: string; reasoning?: string; problem: boolean; quotes?: string[]; issue?: string; where?: string | null }
export type Review = {
  checks: Check[]
  code_findings?: { rule: string; quote: string; accepted: boolean }[]
  severity: 'ok' | 'zamechaniya' | 'oshibki' | 'perepisat'
}

export type GenContext = { userId: string; settings: AuthorSettings; memory: Memory; editPairs?: string }
export type GenRequest = {
  topic: string
  format: FormatCode
  intent?: string | null          // точный смысл, если выбран
  intentChoices?: string[] | null // смыслы кнопки «Что дать читателю»
  userDetail?: string | null
  coreBlock?: string | null       // ядро мысли для этого формата (group.ts coreBlockFor), набор из одной мысли
  neighbors?: string | null       // что делают соседние форматы набора, «не начинай так же»
}

const LENGTH_LIMIT: Record<string, number> = { korotko: 400, sredne: 900, dlinno: 1800 }
// в Telegram посты длиннее: канал читают те, кто уже выбрал автора
const LENGTH_LIMIT_TG: Record<string, number> = { korotko: 900, sredne: 1800, dlinno: 3200 }

// ---------- П1 ----------
export async function runPlan(ctx: GenContext, req: GenRequest): Promise<Plan> {
  const s = ctx.settings
  const intentVar = req.intent && INTENT_CODES.includes(req.intent)
    ? req.intent
    : req.intentChoices?.length ? `выбери один из: ${req.intentChoices.join(', ')}` : ''
  const user = buildP1User({
    base_settings: s.baseSettings,
    voice_core_short: s.voiceCoreShort,
    position: s.position,
    story_bank_relevant: storiesText(relevantStories(s.stories, req.topic)),
    client_pain_phrases: s.clientPhrases,
    ...memoryVars(ctx.memory),
    topic: req.topic,
    format_code: req.format === 'reels_auto' ? 'reels_auto (вид рилса выбери сам, правило 12)' : req.format,
    intent: intentVar,
    user_detail: req.userDetail,
  })
  const raw = await callJson<Plan>({
    system: P1_SYSTEM, user, effort: 'low', verbosity: 'low', maxTokens: 4000,
    userId: ctx.userId, operation: 'generate_post_plan', knownNames: s.knownNames,
  })
  return normalizePlan(raw, req)
}

function normalizePlan(p: any, req: GenRequest): Plan {
  const intent = INTENT_CODES.includes(p?.intent) ? p.intent
    : req.intent && INTENT_CODES.includes(req.intent) ? req.intent
    : req.intentChoices?.[0] || 'uznavanie'
  return {
    ...p,
    intent,
    topic_for_text: String(p?.topic_for_text || req.topic),
    ring: p?.ring === true,
    risks: Array.isArray(p?.risks) ? p.risks.map(String) : [],
    need_detail: p?.need_detail ? String(p.need_detail) : null,
    reels_format: req.format === 'reels_auto' ? pickReelsFormat(p?.reels_format, intent) : isReels(req.format) ? req.format : null,
  }
}

// Вид рилса: что выбрал план, иначе по смыслу.
const REELS_BY_INTENT: Record<string, FormatCode> = {
  yumor: 'reels_rol', kak_v_terapii: 'reels_scenka', uznavanie: 'reels_spisok', dlya_blizkih: 'reels_spisok',
  obyasnenie: 'reels_otvet', mehanizm: 'reels_monolog', svoya_istoriya: 'reels_istoriya', podderzhka: 'reels_poslanie',
  razreshenie: 'reels_poslanie', perevod_repliki: 'reels_otvet',
}
export function pickReelsFormat(v: unknown, intent: string): FormatCode {
  const f = String(v || '')
  // доску и видео без лица план больше не выбирает (решение 30.09: психолог вид не выбирает, видов меньше)
  if ((REELS_FORMATS as readonly string[]).includes(f) && f !== 'reels_doska' && f !== 'reels_bez_slov') return f as FormatCode
  return REELS_BY_INTENT[intent] || 'reels_monolog'
}

// Живые ролики из банка (разбор 71 рилса): для рилса два того же вида; для поста и Telegram
// один монолог, для карусели один список, как ориентир живой речи. С матом только если мат разрешен.
export function examplesFor(ctx: GenContext, plan: Plan, format: FormatCode): LiveExample[] {
  if (format === 'reels_auto' || format === 'stories') return []
  const opts = { allowMat: ctx.settings.profanityRule !== 'не использовать', rotation: ctx.memory.count }
  if (isReels(format)) return pickExamples(format, plan.intent, opts)
  if (format === 'carousel') return pickExamples('reels_spisok', plan.intent, { ...opts, count: 1 })
  return pickExamples('reels_monolog', plan.intent, { ...opts, count: 1 })
}

// Материал для П2/П4/П5: поле плана плюс полный текст истории и позиции, если план их взял.
export function materialFromPlan(ctx: GenContext, plan: Plan, req: GenRequest): string {
  const s = ctx.settings
  const material = String(plan.material || 'нет')
  const parts = [`Что берем из данных психолога: ${material}`]
  if (req.userDetail) parts.push(`Деталь от психолога: ${req.userDetail}`)
  if (!/^нет\.?$/i.test(material.trim())) {
    const key = (t: string) => new Set(t.toLowerCase().split(/[^\p{L}]+/u).filter(w => w.length > 3).map(w => w.slice(0, 5)))
    const mk = key(material)
    const overlap = (t: string) => [...key(t)].filter(w => mk.has(w)).length
    const stories = s.stories.filter(st => overlap(st.text) >= 3)
    if (stories.length) parts.push(`Истории психолога, которые взял план:\n${storiesText(stories)}`)
    if (s.position && (['poziciya', 'mif', 'priglashenie'].includes(plan.intent) || overlap(s.position) >= 2)) {
      parts.push(`Позиция психолога: ${s.position}`)
    }
  }
  // как на консультации и приглашение: чего клиент боится, что пробовал и что меняется (профиль практики, 8а)
  if (s.practiceFacts && [plan.intent, req.intent].some(i => i === 'kak_v_terapii' || i === 'priglashenie')) parts.push(s.practiceFacts)
  return parts.join('\n\n')
}

// ---------- П2 ----------
export async function runText(ctx: GenContext, plan: Plan, req: GenRequest, rewriteNote?: string): Promise<string> {
  const s = ctx.settings
  const mv = memoryVars(ctx.memory)
  const system = buildP2System({
    profanity_rule: s.profanityRule,
    gender_forms: s.genderForms,
    address: s.address,
    reader_gender_rule: s.readerGenderRule,
  })
  const user = buildP2User({
    voice_core: s.voiceCore,
    sample_1: s.samples[0], sample_2: s.samples[1], sample_3: s.samples[2],
    base_settings: s.baseSettings,
    intent_card: INTENT_CARDS[plan.intent],
    format_card: FORMAT_CARDS[req.format],
    material_from_plan: materialFromPlan(ctx, plan, req),
    plan_json: JSON.stringify(plan, null, 2),
    last_openings: mv.last_openings,
    used_signature_phrases: mv.used_signature_phrases,
    used_details: mv.used_details,
    feedback_reasons: mv.feedback_reasons,
    rewrite_note: rewriteNote,
    topic_for_text: plan.topic_for_text,
    core_block: req.coreBlock,
    neighbors: req.neighbors,
    edit_pairs: ctx.editPairs,
    live_examples: examplesText(examplesFor(ctx, plan, req.format)),
  })
  // Два черновика параллельно: второй просим взять другую сцену и сравнение и звучать смелее.
  // Дешевая модель выбирает, какой живее (П2в). GENERATION_CANDIDATES=1 возвращает старое поведение.
  const n = Math.max(1, Math.min(3, Number(process.env.GENERATION_CANDIDATES || 2)))
  const effort = (process.env.GENERATION_WRITER_EFFORT === 'low' ? 'low' : 'medium') as 'low' | 'medium'
  const write = (i: number) => callModel({
    system,
    user: i === 0 ? user : `${user}\n\nЭто черновик ${i + 1}. Не бери первое, что пришло в голову: другая сцена, другое сравнение, другой первый ход, чем обычно, и интонация автора смелее. Все правила выше в силе.`,
    effort, verbosity: 'medium', maxTokens: 8000,
    userId: ctx.userId, operation: 'generate_post_text', writer: true, knownNames: s.knownNames,
  })
  if (n === 1) return simplify(ctx, req, await write(0))
  const settled = await Promise.allSettled(Array.from({ length: n }, (_, i) => write(i)))
  const drafts = settled.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled').map(r => r.value)
  if (!drafts.length) throw (settled[0] as PromiseRejectedResult).reason
  if (drafts.length === 1) return simplify(ctx, req, drafts[0])
  return simplify(ctx, req, await pickBest(ctx, plan, req, drafts))
}

// П2п: переписать фразы, которые не понять с первого раза или которые звучат как перевод.
// Если проход сломал формат (пропали метки или текст стал вдвое короче/длиннее), оставляем как было.
async function simplify(ctx: GenContext, req: GenRequest, text: string): Promise<string> {
  if (process.env.GENERATION_SIMPLIFY === '0') return text
  try {
    const out = await callModel({
      system: P2P_SYSTEM,
      user: buildP2P({ base_settings: ctx.settings.baseSettings, format_code: req.format, text }),
      effort: 'low', verbosity: 'medium', maxTokens: 8000,
      userId: ctx.userId, operation: 'generate_post_simple', writer: true, knownNames: ctx.settings.knownNames,
    })
    const labels = (t: string) => (t.match(/^(?:Слайд\s*\d+|Экран\s*\d+|Текст на экране|Речь|Подпись|Кадр|[АБ])\s*:/gmu) || []).length
    const ratio = out.length / Math.max(1, text.length)
    if (labels(out) < labels(text) || ratio < 0.6 || ratio > 1.4) return text
    return out
  } catch {
    return text
  }
}

// П2в: какой черновик живее. Если выбор не вышел, берем тот, где у кода меньше находок.
async function pickBest(ctx: GenContext, plan: Plan, req: GenRequest, drafts: string[]): Promise<string> {
  const checks = drafts.map(d => codeCheck(ctx, d, plan, req.format).findings.filter(f => f.rule !== 'zaglushka'))
  const fallback = checks.reduce((best, f, i) => (f.length < checks[best].length ? i : best), 0)
  try {
    const candidates = drafts.map((d, i) => `<черновик ${i + 1}>\n${d}\n</черновик ${i + 1}>\nНаходки кода: ${checks[i].map(f => f.rule).join(', ') || 'нет'}`).join('\n\n')
    const res = await callJson<{ best?: number }>({
      system: 'Ответ только JSON без пояснений.',
      user: buildP2V({ base_settings: ctx.settings.baseSettings, format_code: req.format, topic_for_text: plan.topic_for_text, candidates }),
      model: String(process.env.GENERATION_PICKER_MODEL || 'gpt-6-luna'),
      effort: 'low', verbosity: 'low', maxTokens: 1500,
      userId: ctx.userId, operation: 'generate_post_pick', knownNames: ctx.settings.knownNames,
    })
    const k = Number(res?.best) - 1
    return drafts[k >= 0 && k < drafts.length ? k : fallback]
  } catch {
    return drafts[fallback]
  }
}

// ---------- П3 ----------
export function codeCheck(ctx: GenContext, text: string, plan: Plan, format: FormatCode) {
  const maxChars = !plan.length ? undefined : format === 'post' ? LENGTH_LIMIT[plan.length] : format === 'post_tg' ? LENGTH_LIMIT_TG[plan.length] : undefined
  return guard(text, {
    format,
    lastOpenings: ctx.memory.lastOpenings,
    maxChars,
    signatures: ctx.settings.signatures,
    examples: examplesFor(ctx, plan, format).map(e => e.text),
  })
}

// ---------- П4 ----------
function reviewVars(ctx: GenContext, plan: Plan, req: GenRequest, text: string, findings: GuardFinding[]) {
  const s = ctx.settings
  return {
    voice_core: s.voiceCore,
    samples_used: s.samples.map((x, i) => `Образец ${i + 1}:\n${x}`).join('\n\n') || 'нет',
    base_settings: s.baseSettings,
    intent_card: INTENT_CARDS[plan.intent],
    format_card: FORMAT_CARDS[req.format],
    material_from_plan: materialFromPlan(ctx, plan, req),
    plan_json: JSON.stringify(plan, null, 2),
    guard_findings_json: JSON.stringify(findings.filter(f => f.rule !== 'zaglushka')),
    text_after_autofix: text,
    edit_pairs: ctx.editPairs,
    live_examples: examplesText(examplesFor(ctx, plan, req.format)),
  }
}

export async function runReview(ctx: GenContext, plan: Plan, req: GenRequest, text: string, findings: GuardFinding[]): Promise<Review> {
  const r = await callJson<Review>({
    system: P4_SYSTEM, user: buildP4User(reviewVars(ctx, plan, req, text, findings)),
    effort: 'low', verbosity: 'low', maxTokens: 6000,
    userId: ctx.userId, operation: 'generate_post_check', knownNames: ctx.settings.knownNames,
  })
  return normalizeReview(r)
}

async function runMini(ctx: GenContext, plan: Plan, req: GenRequest, before: string, after: string, findings: GuardFinding[]): Promise<Review> {
  const r = await callJson<Review>({
    system: P4_SYSTEM,
    user: buildP4MiniUser(reviewVars(ctx, plan, req, after, findings), changedFragments(before, after) || 'нет изменений'),
    effort: 'low', verbosity: 'low', maxTokens: 4000,
    userId: ctx.userId, operation: 'generate_post_check_mini', knownNames: ctx.settings.knownNames,
  })
  return normalizeReview(r)
}

function normalizeReview(r: any): Review {
  const checks: Check[] = Array.isArray(r?.checks) ? r.checks.map((c: any) => ({
    id: String(c?.id || ''), reasoning: c?.reasoning, problem: c?.problem === true,
    quotes: Array.isArray(c?.quotes) ? c.quotes.map(String) : [], issue: c?.issue || '', where: c?.where ?? null,
  })) : []
  const code_findings = Array.isArray(r?.code_findings) ? r.code_findings.map((f: any) => ({
    rule: String(f?.rule || ''), quote: String(f?.quote || ''), accepted: f?.accepted !== false,
  })) : []
  const review: Review = { checks, code_findings, severity: 'ok' }
  review.severity = severityOf(review, r?.severity)
  return review
}

// Серьезность считает и модель, и код по тем же правилам; берем более строгую.
const RANK = { ok: 0, zamechaniya: 1, oshibki: 2, perepisat: 3 } as const
export function severityOf(r: Review, modelSeverity?: string): Review['severity'] {
  const p = (id: string) => r.checks.find(c => c.id === id)
  let sev: Review['severity'] = 'ok'
  const golos = p('golos')
  if (golos?.problem && golos.where === 'ves_tekst') sev = 'perepisat'
  else if (['smysl', 'vydumka', 'etika', 'kopiya', 'klon'].some(id => p(id)?.problem)
    || (p('shtampy')?.problem && (p('shtampy')!.quotes?.length || 0) >= 3)
    || (golos?.problem && golos.where === 'fragment')) sev = 'oshibki'
  else if (r.checks.some(c => c.problem)
    || (r.code_findings || []).some(f => f.accepted && ['tire', 'dlina', 'povtor_zahoda', 'monotonno', 'mnogo_firmennyh'].includes(f.rule))) sev = 'zamechaniya'
  const m = modelSeverity && modelSeverity in RANK ? (modelSeverity as Review['severity']) : 'ok'
  return RANK[m] > RANK[sev] ? m : sev
}

type Issue = { id: string; quotes?: string[]; issue?: string; where?: string | null }
function issuesFrom(r: Review, extra: GuardFinding[] = []): Issue[] {
  const fromChecks = r.checks.filter(c => c.problem).map(c => ({ id: c.id, quotes: c.quotes, issue: c.issue, where: c.where }))
  const fromCode = (r.code_findings || []).filter(f => f.accepted && f.rule !== 'zaglushka')
    .map(f => ({ id: f.rule, quotes: [f.quote], issue: `находка кода: ${f.rule}` }))
  const fromExtra = extra.filter(f => f.rule !== 'zaglushka').map(f => ({ id: f.rule, quotes: [f.quote], issue: `находка кода: ${f.rule}` }))
  return [...fromChecks, ...fromCode, ...fromExtra]
}

// ---------- П5 ----------
export async function runFix(ctx: GenContext, plan: Plan, req: GenRequest, text: string, issues: Issue[], wholeTextMode = false): Promise<string> {
  const s = ctx.settings
  const system = buildP5System({ used_signature_phrases: memoryVars(ctx.memory).used_signature_phrases })
  const user = buildP5User({
    voice_core: s.voiceCore,
    base_settings: s.baseSettings,
    intent_card: INTENT_CARDS[plan.intent],
    format_card: FORMAT_CARDS[req.format],
    material_from_plan: materialFromPlan(ctx, plan, req),
    plan_json: JSON.stringify(plan, null, 2),
    text,
    issues_json: JSON.stringify(issues, null, 2),
    edit_pairs: ctx.editPairs,
  }, wholeTextMode)
  return callModel({
    system, user, effort: 'low', verbosity: 'medium', maxTokens: 8000,
    userId: ctx.userId, operation: 'generate_post_fix', writer: true, knownNames: s.knownNames,
  })
}

// Измененные предложения и по одному соседу до и после (для П4-мини).
export function changedFragments(before: string, after: string): string {
  const split = (t: string) => t.split(/(?<=[.!?…])\s+|\n+/u).map(x => x.trim()).filter(Boolean)
  const old = new Set(split(before))
  const a = split(after)
  const keep = new Set<number>()
  a.forEach((sent, i) => { if (!old.has(sent)) [i - 1, i, i + 1].forEach(j => j >= 0 && j < a.length && keep.add(j)) })
  return [...keep].sort((x, y) => x - y).map(i => a[i]).join('\n')
}

// ---------- Оркестровка ----------

export type Draft =
  | { kind: 'need_detail'; plan: Plan; question: string }
  | { kind: 'text'; plan: Plan; text: string; findings: GuardFinding[] }

// Первая часть: план и текст. need_detail возвращается, если план просит деталь и психолог еще не ответил и не пропустил.
export async function draft(ctx: GenContext, req: GenRequest, opts?: { plan?: Plan; skipDetail?: boolean }): Promise<Draft> {
  let plan = opts?.plan ? normalizePlan(opts.plan, req) : await runPlan(ctx, req)
  // «Подбери сама» для рилса: дальше вся цепочка (П2-П5, запись в базу) работает с выбранным видом
  if (req.format === 'reels_auto') req.format = (plan.reels_format as FormatCode) || 'reels_monolog'
  if (plan.need_detail && !req.userDetail && !opts?.skipDetail) {
    return { kind: 'need_detail', plan, question: plan.need_detail }
  }
  const raw = await runText(ctx, plan, req)
  const g = codeCheck(ctx, raw, plan, req.format)
  return { kind: 'text', plan, text: g.text, findings: g.findings }
}

export type Refined = { text: string; review: Review; fixes: number; rewritten: boolean; changed: boolean }

// Вторая часть: проверка, правка, П4-мини. Максимум две правки, в конце finalNet.
export async function refine(ctx: GenContext, plan: Plan, req: GenRequest, text0: string, findings0: GuardFinding[]): Promise<Refined> {
  let text = text0
  let findings = findings0
  let review = await runReview(ctx, plan, req, text, findings)
  let rewritten = false

  if (review.severity === 'perepisat') {
    const quotes = review.checks.find(c => c.id === 'golos')?.quotes?.join(' | ') || ''
    const note = `Прошлая версия звучала как психолог вообще, вот эти фразы: ${quotes}. Пиши голосом автора в полную силу`
    const g2 = codeCheck(ctx, await runText(ctx, plan, req, note), plan, req.format)
    const review2 = await runReview(ctx, plan, req, g2.text, g2.findings)
    rewritten = true
    const problems = (r: Review) => r.checks.filter(c => c.problem).length
    if (review2.severity !== 'perepisat' || problems(review2) <= problems(review)) {
      text = g2.text; findings = g2.findings; review = review2
    }
    if (review.severity === 'perepisat') {
      return { text: finalNet(text), review, fixes: 0, rewritten, changed: text !== text0 }
    }
  }

  if (review.severity === 'ok') return { text: finalNet(text), review, fixes: 0, rewritten, changed: text !== text0 }

  const key = (f: GuardFinding) => `${f.rule}::${f.quote}`
  const seen = new Set(findings.map(key))
  const rejected = new Set((review.code_findings || []).filter(f => !f.accepted).map(f => `${f.rule}::${f.quote}`))

  let issues = issuesFrom(review)
  let fixes = 0
  while (issues.length && fixes < 2) {
    const before = text
    text = autofix(await runFix(ctx, plan, req, text, issues))
    fixes++
    const g = codeCheck(ctx, text, plan, req.format)
    const fresh = g.findings.filter(f => !seen.has(key(f)) && !rejected.has(key(f)))
    fresh.forEach(f => seen.add(key(f)))
    if (fixes >= 2) break
    const mini = await runMini(ctx, plan, req, before, text, g.findings)
    issues = issuesFrom({ ...mini, code_findings: [] }, fresh)
  }
  return { text: finalNet(text), review, fixes, rewritten, changed: text !== text0 }
}

// Кнопки «Поправить»: П5 в режиме правки всего текста.
export async function applyButton(ctx: GenContext, plan: Plan, req: GenRequest, text: string, button: string): Promise<string> {
  const ask = BUTTONS[button]
  if (!ask) throw new Error('Неизвестная кнопка')
  const out = await runFix(ctx, plan, req, text, [{ id: 'knopka', issue: ask }], true)
  return finalNet(autofix(out))
}

// П6: три других захода.
export async function otherHooks(ctx: GenContext, plan: Plan, req: GenRequest, text: string): Promise<{ hook_type: string; text: string; why: string }[]> {
  const s = ctx.settings
  const prompt = buildP6({
    base_settings: s.baseSettings,
    intent: plan.intent,
    format_code: req.format,
    current_opening: extractOpening(text, req.format),
    current_hook_type: plan.hook_type || 'нет',
    allowed_hook_types_with_descriptions: allowedHooksWithDescriptions(plan.intent),
    last_openings: memoryVars(ctx.memory).last_openings,
    voice_core_short: s.voiceCoreShort || 'нет',
    client_pain_phrases: s.clientPhrases || 'нет',
  })
  const res = await callJson<any>({
    system: 'Ответ только JSON без пояснений.', user: prompt, json: false, effort: 'low', verbosity: 'low', maxTokens: 3000,
    userId: ctx.userId, operation: 'generate_post_hooks', writer: true, knownNames: s.knownNames,
  })
  const list = Array.isArray(res) ? res : Array.isArray(res?.hooks) ? res.hooks : []
  return list.slice(0, 3).map((h: any) => ({ hook_type: String(h?.hook_type || ''), text: finalNet(autofix(String(h?.text || ''))), why: String(h?.why || '') }))
}

// П8: три надписи на картинку-обложку к посту в Instagram. Плана не нужно: хватает текста поста.
export async function coverTexts(ctx: GenContext, text: string): Promise<{ text: string; why: string }[]> {
  const s = ctx.settings
  const prompt = buildP8({ base_settings: s.baseSettings, post_text: text.slice(0, 4000) })
  const res = await callJson<any>({
    system: 'Ответ только JSON без пояснений.', user: prompt, json: false, effort: 'low', verbosity: 'low', maxTokens: 2000,
    userId: ctx.userId, operation: 'generate_post_cover', writer: true, knownNames: s.knownNames,
  })
  const list = Array.isArray(res) ? res : Array.isArray(res?.covers) ? res.covers : []
  return list
    .map((c: any) => ({ text: finalNet(autofix(String(c?.text || ''))).replace(/^[«"]+|[»"]+$/g, '').replace(/[.:]+$/, '').trim(), why: String(c?.why || '') }))
    .filter((c: { text: string }) => c.text && c.text.split(/\s+/).length <= 10)
    .slice(0, 3)
}

// Поля для записи в generated_posts (миграция 20260930120000_generation_brain.sql).
export function postFields(ctx: GenContext, plan: Plan, req: GenRequest, text: string) {
  return {
    format_code: req.format,
    intent: plan.intent,
    hook_type: plan.hook_type || null,
    arc: plan.arc || null,
    ending_type: plan.ending_type || null,
    ring: plan.ring === true,
    opening: extractOpening(text, req.format).slice(0, 200),
    details: plan.detail ? [plan.detail] : [],
    client_phrase_used: plan.client_phrase_used || null,
    signatures_used: findSignatures(text, ctx.settings.signatures),
    topic_for_text: plan.topic_for_text,
    plan,
    pipeline_version: PIPELINE_VERSION,
  }
}

// ---------- П0: слепок голоса ----------
export type VoiceCoreResult = { voiceCore: string; signatures: string[]; fit: (boolean | null)[]; cleaned: string[]; keptIndex: number[] }

export async function buildVoiceCore(userId: string, rawSamples: string[], knownNames: string[]): Promise<VoiceCoreResult> {
  const prepared = rawSamples.map((s, i) => ({ i, text: cleanSample(String(s || '')).trim() })).filter(x => x.text.length >= 60).slice(0, 8)
  if (!prepared.length) throw new Error('Нужен хотя бы один текст длиннее пары строк')
  const cleaned = prepared.map(x => x.text)
  const keptIndex = prepared.map(x => x.i)
  const voiceCore = await callModel({
    system: P0_SYSTEM, user: buildP0User(cleaned), effort: 'medium', verbosity: 'medium', maxTokens: 8000,
    userId, operation: 'voice_core', knownNames,
  })
  return { voiceCore, signatures: parseSignatures(voiceCore), fit: parseSampleFit(voiceCore, cleaned.length), cleaned, keptIndex }
}
