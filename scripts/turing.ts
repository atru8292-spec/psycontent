// Тест «живой психолог или нейросеть». Оценка «нравится ли текст» у нейросети-оценщика перекошена:
// ей нравятся тексты нейросети. Поэтому меряем другое: можно ли отличить наш текст от живого.
// Цель: угадывают не лучше, чем монеткой (около 50%). Пока угадывают, то, по чему угадали, и есть список доработок.
//
// Два режима:
// 1) страница для людей (бесплатно, без модели):
//      npx tsx scripts/turing.ts --runs=2026-10-01_02-46-10_rilsy
//    _знания/мозг-генератора/test/turing/<дата>/turing.html: тексты вперемешку, у каждого «Живой» / «Нейросеть»,
//    в конце «Показать ответы» и сколько угадано. Можно отправить файл знакомым психологам.
// 2) угадывает модель (деньги, около 2 ₽ за пару):
//      npx tsx --env-file=.env.local scripts/turing.ts --runs=... --judge --yes
//    модель получает пары одного вида (живой ролик + наш), угадывает, где живой, и выписывает,
//    по каким фразам узнала нейросеть и что есть у живого, чего нет у нашего. Отчет judge.html и judge.md.
// Без --runs берутся три последних прогона eval (кроме калибровки, демо и ножниц).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LIVE_EXAMPLES } from '../lib/generation/examples'
import { callJson, modelFor } from '../lib/generation/ai'

const TEST = join(__dirname, '..', '_знания', 'мозг-генератора', 'test')
const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
const has = (name: string) => argv.includes(`--${name}`)

type Item = { id: string; kind: 'live' | 'gen'; format: string; text: string; src: string }

import { plainText } from './turing-text'
export { plainText }

function pickRuns(): string[] {
  const dir = join(TEST, 'eval')
  const given = flag('runs').split(',').filter(Boolean)
  if (given.length) return given
  return readdirSync(dir)
    .filter(d => /^\d{4}-/.test(d) && !/kalibrovka|nozhnicy|demo/.test(d) && existsSync(join(dir, d, 'results.json')))
    .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)
    .slice(0, 3)
}

function genItems(runs: string[]): Item[] {
  const items: Item[] = []
  for (const run of runs) {
    const f = join(TEST, 'eval', run, 'results.json')
    if (!existsSync(f)) { console.warn(`нет прогона ${run}`); continue }
    for (const r of JSON.parse(readFileSync(f, 'utf8'))) {
      if (r.error || !r.text) continue
      const text = plainText(r.text)
      if (/\[добавь:/u.test(text) || text.split(/\s+/).length < 25) continue
      items.push({ id: `${run}/${r.id}`, kind: 'gen', format: r.format, text, src: `${r.author}, ${r.topic}` })
    }
  }
  return items
}

// Живые посты из Telegram-каналов психологов (_знания/живые-посты): для пар с нашими постами,
// иначе пост узнают просто по тому, что живые все короткие и устные. Берем самые просматриваемые,
// по очереди из разных каналов, без ссылок, рекламы и анонсов.
export function livePosts(): Item[] {
  const dir = join(__dirname, '..', '_знания', 'живые-посты')
  if (!existsSync(dir)) return []
  const byChannel: Item[][] = []
  // каналы, где посты сами звучат как шаблон или нейросеть («Топ 10 шагов», «Ты когда-нибудь чувствовала?»), и мемы: не эталон
  const skip = new Set(['inner_compass_psy', 'evidence_based_psy', 'psy_memes', 'psikhologd'])  // psikhologd звучит как учебник, судья принимал его за нейросеть
  for (const f of readdirSync(dir).filter(x => x.endsWith('.txt') && !skip.has(x.replace('.txt', '')))) {
    const raw = readFileSync(join(dir, f), 'utf8')
    const posts = raw.split(/^===== ПОСТ /m).slice(1).map(chunk => {
      const views = Number((chunk.match(/просмотры:\s*(\d+)/) || [])[1] || 0)
      // эмодзи убираем: у наших текстов их нет, иначе живой пост узнают по смайлику
      const text = chunk.split('\n').slice(1).join('\n').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu, '').replace(/[ \t]{2,}/g, ' ').trim()
      return { views, text }
    }).filter(p => {
      const w = p.text.split(/\s+/).length
      return w >= 100 && w <= 320 && !/https?:|t\.me|#|запис|курс|эфир|₽|руб|скидк|марафон|розыгрыш|ссылк/iu.test(p.text)
    }).sort((a, b) => b.views - a.views).slice(0, 5)
    byChannel.push(posts.map((p, i) => ({ id: `${f.replace('.txt', '')}#${i + 1}`, kind: 'live' as const, format: 'post', text: p.text, src: `живой пост, канал ${f.replace('.txt', '')}` })))
  }
  const out: Item[] = []
  for (let i = 0; byChannel.some(c => c[i]); i++) for (const c of byChannel) if (c[i]) out.push(c[i])
  return out
}

// Живые тексты под те же виды, что и наши; не хватает своего вида, добираем монологами.
// --seed=N меняет подборку живых пар (порядок живых примеров и постов) и то, какой текст в паре первый:
// два прогона судьи с разным seed дают две независимые подборки по тем же нашим текстам.
const SEED = Number(flag('seed') || 0)
function liveItems(gen: Item[]): Item[] {
  const used = new Set<string>()
  const out: Item[] = []
  const posts = SEED ? shuffle(livePosts(), SEED) : livePosts()
  const bank = SEED ? shuffle(LIVE_EXAMPLES, SEED + 1) : LIVE_EXAMPLES
  const take = (format: string) => {
    // живых меньше, чем наших (48 рилсов на 24 живых): по кругу, свой вид первым
    if (!bank.some(x => !used.has(x.id))) used.clear()
    const e = bank.find(x => x.format === format && !used.has(x.id))
      || bank.find(x => x.format === 'reels_monolog' && !used.has(x.id))
      || bank.find(x => !used.has(x.id))
    if (!e) return null
    used.add(e.id)
    return { id: e.id, kind: 'live' as const, format: e.format, text: plainText(e.text), src: `живой ролик ${e.id}` }
  }
  for (const g of gen) {
    const l = (g.format === 'post' || g.format === 'post_tg') && posts.length ? posts.shift()! : take(g.format)
    if (l) out.push(l)
  }
  return out
}

// Перемешивание с зерном, чтобы страница не менялась при каждой пересборке
function shuffle<T>(a: T[], seed = 7): T[] {
  const r = [...a]
  let s = seed
  for (let i = r.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function humanPage(items: Item[], runId: string): string {
  const data = JSON.stringify(items.map(i => ({ id: i.id, k: i.kind, t: i.text, s: i.src }))).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Живой или нейросеть</title>
<style>
:root{--bg:#F7F3EC;--ink:#2E2A45;--muted:#6B6680;--acc:#5B4FA0;--soft:#E7E2F2;--line:#E4DED2;--ok:#5F7A3A;--bad:#B4533F}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px;z-index:2;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
h1{font-size:17px;margin:0;flex:1 1 auto}button{font:inherit;border:1px solid var(--line);background:#fff;border-radius:10px;padding:7px 12px;cursor:pointer;color:var(--ink)}
button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
main{max-width:720px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:18px}
.c{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:12px}
.t{white-space:pre-wrap}.row{display:flex;gap:8px;flex-wrap:wrap}.n{font-size:13px;color:var(--muted)}
.ans{font-size:14px;font-weight:600}.ans.ok{color:var(--ok)}.ans.bad{color:var(--bad)}.res{font-weight:600}
</style></head><body>
<header><h1>Живой психолог или нейросеть?</h1><span id="score" class="res"></span><button id="reveal">Показать ответы</button><button id="dl">Скачать ответы</button></header>
<main id="m"><p class="n">Читай как подписчик в ленте. Отмечай чутьем, не разбирай по словам. Половина текстов от живых психологов, половина от нейросети.</p></main>
<script>
const D=${data};const KEY='turing-${runId}';let A={};try{A=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
let shown=false;const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(A))}catch(e){}};
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function render(){const m=document.getElementById('m');m.querySelectorAll('.c').forEach(x=>x.remove());
D.forEach((d,i)=>{const c=document.createElement('div');c.className='c';const a=A[d.id];
const right=a&&((a==='live')===(d.k==='live'));
c.innerHTML='<div class="n">Текст '+(i+1)+' из '+D.length+'</div><div class="t">'+esc(d.t)+'</div>'
+'<div class="row"><button data-a="live" class="'+(a==='live'?'on':'')+'">Живой человек</button><button data-a="gen" class="'+(a==='gen'?'on':'')+'">Нейросеть</button></div>'
+(shown?'<div class="ans '+(a?(right?'ok':'bad'):'')+'">'+(d.k==='live'?'Живой':'Нейросеть')+' · '+esc(d.s)+(a?(right?' · угадала':' · не угадала'):'')+'</div>':'');
c.querySelectorAll('button[data-a]').forEach(b=>b.onclick=()=>{A[d.id]=b.dataset.a;save();render()});m.appendChild(c)});
const done=D.filter(d=>A[d.id]);const ok=done.filter(d=>(A[d.id]==='live')===(d.k==='live')).length;
document.getElementById('score').textContent=shown?('угадано '+ok+' из '+done.length+(done.length?' ('+Math.round(ok*100/done.length)+'%)':'')):(done.length+' из '+D.length+' отмечено')}
document.getElementById('reveal').onclick=()=>{shown=!shown;document.getElementById('reveal').textContent=shown?'Спрятать ответы':'Показать ответы';render()};
document.getElementById('dl').onclick=()=>{const b=new Blob([JSON.stringify({run:KEY,answers:A},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='turing-${runId}.json';a.click()};
render();
</script></body></html>`
}

const JUDGE_SYSTEM = `Тебе дают два текста одного вида: пост психолога или то, что психолог говорит в Reels. Один написал живой психолог для своего блога, второй написала нейросеть, которую учили писать как живой психолог. Тексты Reels это расшифровка устной речи: корявости, повторы и оговорки бывают у обоих, на опечатки не смотри.

Определи, какой текст написал живой человек. Потом честно выпиши, по чему ты узнал нейросеть: дословные фразы и что с ними не так. Обычные признаки: слишком гладко и складно, логика без скачков, каждая мысль аккуратно объяснена, ровный ритм, предсказуемый ход «сцена, объяснение, вывод», умная формула вместо живой реакции, слишком удачные сравнения, все детали работают на мысль, нет лишнего и случайного, нет самого автора с его настроением. И отдельно: что есть у живого текста, чего нет у текста нейросети.

Ответ только JSON: {"live": 1 или 2, "sure": от 1 до 5, "tells": [{"quote": "дословно из текста нейросети", "why": "коротко"}], "live_has": "одна-две фразы"}`

type Verdict = { live: number; sure: number; tells: { quote: string; why: string }[]; live_has: string }
type Pair = { gen: Item; live: Item; genFirst: boolean; v: Verdict | null; right: boolean | null }

async function judgePair(gen: Item, live: Item, genFirst: boolean): Promise<Verdict | null> {
  const [a, b] = genFirst ? [gen, live] : [live, gen]
  const user = `<текст 1>\n${a.text}\n</текст 1>\n\n<текст 2>\n${b.text}\n</текст 2>`
  try {
    return await callJson<Verdict>({ system: JUDGE_SYSTEM, user, effort: 'medium', verbosity: 'low', maxTokens: 3000, operation: 'eval_turing', model: flag('model') || undefined })
  } catch (e: any) {
    console.warn(`пара ${gen.id} не вышла: ${e?.message || e}`)
    return null
  }
}

function judgeReport(pairs: Pair[], meta: string): { md: string; html: string } {
  const done = pairs.filter(p => p.v)
  const right = done.filter(p => p.right).length
  const pct = done.length ? Math.round((right * 100) / done.length) : 0
  const md = [
    `# Живой или нейросеть: ${meta}`, '',
    `Модель угадала живой текст в ${right} парах из ${done.length} (${pct}%). Цель около 50%: значит, не отличить.`, '',
    '## По чему узнает нейросеть (это и есть список доработок)', '',
    ...done.flatMap(p => (p.v!.tells || []).map(t => `- ${p.gen.id}: «${t.quote}» ${t.why}`)), '',
    '## Что есть у живых, чего нет у наших', '',
    ...done.map(p => `- ${p.gen.id} против ${p.live.id}: ${p.v!.live_has}`),
  ].join('\n')
  const cards = pairs.map(p => `<div class="c"><div class="n">${esc(p.gen.src)} · против ${esc(p.live.id)} · ${p.v ? (p.right ? '<b class="bad">узнала нейросеть</b>' : '<b class="ok">не отличила</b>') + ', уверенность ' + p.v.sure : 'нет ответа'}</div>
<div class="two"><div><div class="h">Наш</div><div class="t">${esc(p.gen.text)}</div></div><div><div class="h">Живой</div><div class="t">${esc(p.live.text)}</div></div></div>
${p.v ? `<div class="tells">${(p.v.tells || []).map(t => `<div>«${esc(t.quote)}» ${esc(t.why)}</div>`).join('')}</div><div class="n">У живого есть: ${esc(p.v.live_has)}</div>` : ''}</div>`).join('')
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Живой или нейросеть</title>
<style>:root{--bg:#F7F3EC;--ink:#2E2A45;--muted:#6B6680;--acc:#5B4FA0;--soft:#E7E2F2;--line:#E4DED2;--ok:#5F7A3A;--bad:#B4533F}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:16px}h1{font-size:19px;margin:0}
.c{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:760px){.two{grid-template-columns:1fr}}
.t{white-space:pre-wrap}.h{font-size:12px;font-weight:600;color:var(--acc)}.n{font-size:13px;color:var(--muted)}
.tells{font-size:14px;color:var(--bad);display:flex;flex-direction:column;gap:4px}.ok{color:var(--ok)}.bad{color:var(--bad)}</style></head>
<body><main><h1>Модель угадала живой текст в ${right} из ${done.length} (${pct}%). Цель около 50%.</h1>${cards}</main></body></html>`
  return { md, html }
}

async function main() {
  if (has('score')) {
    if (!has('yes')) { console.log('Это настоящие деньги (около 0.3 ₽ за текст). Запусти с --yes.'); return }
    const { scoreMain } = await import('./turing-score')
    return scoreMain(pickRuns(), { label: flag('label'), fix: has('fix-etalon'), model: flag('model') || undefined })
  }
  const runs = pickRuns()
  const gen = genItems(runs)
  if (!gen.length) throw new Error('Нет наших текстов в прогонах: ' + runs.join(', '))
  const live = liveItems(gen)
  const runId = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-') + (flag('label') ? `_${flag('label')}` : '') + (SEED ? `_s${SEED}` : '')
  const out = join(TEST, 'turing', runId)
  mkdirSync(out, { recursive: true })
  console.log(`Прогоны: ${runs.join(', ')}. Наших текстов: ${gen.length}, живых: ${live.length}.`)

  const page = shuffle([...gen, ...live])
  writeFileSync(join(out, 'turing.html'), humanPage(page, runId))
  writeFileSync(join(out, 'items.json'), JSON.stringify(page, null, 2))
  console.log(`Страница для людей: open "${join(out, 'turing.html')}"`)

  if (!has('judge')) return
  const n = Math.min(gen.length, live.length)
  console.log(`Угадывает модель (${flag('model') || modelFor(false)}): ${n} пар, около ${n * 2 + 2} ₽.`)
  if (!has('yes')) { console.log('Это настоящие деньги. Запусти с --yes, если согласна.'); return }
  if (!process.env.OPENAI_API_KEY) throw new Error('Нет OPENAI_API_KEY в .env.local')
  const pairs: Pair[] = gen.slice(0, n).map((g, i) => ({ gen: g, live: live[i], genFirst: SEED ? shuffle([0, 1], SEED + 2 + i)[0] === 0 : Math.random() < 0.5, v: null, right: null }))
  const queue = [...pairs]
  await Promise.all([0, 1, 2, 3].map(async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      p.v = await judgePair(p.gen, p.live, p.genFirst)
      if (p.v) p.right = (p.v.live === 1) !== p.genFirst
      console.log(`${p.gen.id}: ${p.v ? (p.right ? 'узнала нейросеть' : 'не отличила') : 'нет ответа'}`)
    }
  }))
  const r = judgeReport(pairs, `${runId}, ${runs.join(', ')}`)
  writeFileSync(join(out, 'judge.md'), r.md)
  writeFileSync(join(out, 'judge.html'), r.html)
  writeFileSync(join(out, 'judge.json'), JSON.stringify(pairs, null, 2))
  console.log(`\nГотово. Открой: open "${join(out, 'judge.html')}"`)
  console.log(r.md.split('\n').slice(0, 4).join('\n'))
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
