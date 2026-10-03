// Слепое сравнение: полная цепочка (план, два черновика, простой язык, проверка, правки)
// против простого пути (один вызов, lib/generation/simple.ts) на одних и тех же темах.
// Варианты перемешаны, Арина выбирает лучший в каждой паре, не зная, где что. Потом кнопка «Показать, где что».
// Это настоящие деньги: около 40 ₽ за тему (полная цепочка около 35, простой путь около 5).
//
// Запуск: npx tsx --env-file=.env.local scripts/ab-test.ts --yes
//         ... --ids=post_1,rol_1   свои темы из scripts/eval-data.ts
// Результат: _знания/мозг-генератора/test/ab/<дата>/ab.html (открыть в браузере) и ab.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildAuthorSettings } from '../lib/generation/settings'
import { draft, refine, buildVoiceCore, type GenContext, type GenRequest } from '../lib/generation/pipeline'
import { simpleWrite } from '../lib/generation/simple'
import { modelFor } from '../lib/generation/ai'
import type { Memory } from '../lib/generation/memory'
import { PERSONAS, TOPICS, type EvalRow, type Who } from './eval-data'

const TEST = join(__dirname, '..', '_знания', 'мозг-генератора', 'test')
const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
const DEFAULT_IDS = ['post_1', 'post_2', 'tg_1', 'carousel_2', 'monolog_2', 'spisok_1', 'scenka_3', 'rol_1', 'otvet_3', 'poslanie_1']

const emptyMemory = (): Memory => ({ count: 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [] })

type Core = { core: string; sig: string[]; fit: (boolean | null)[]; samples: string[] }
async function coreOf(who: Who): Promise<Core> {
  for (const dir of ['eval', 'reels-v35']) {
    const f = join(TEST, dir, `voice_core_${who}.json`)
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  }
  const md = readFileSync(join(TEST, 'samples', `${who}_obrazcy.md`), 'utf8')
  const raw = md.split(/^## Образец \d+\s*$/m).slice(1).map(s => s.trim()).filter(Boolean)
  const r = await buildVoiceCore('', raw, [PERSONAS[who].full_name])
  const c = { core: r.voiceCore, sig: r.signatures, fit: r.fit, samples: r.cleaned }
  mkdirSync(join(TEST, 'eval'), { recursive: true })
  writeFileSync(join(TEST, 'eval', `voice_core_${who}.json`), JSON.stringify(c))
  return c
}

function ctxOf(who: Who, core: Core): GenContext {
  const p = PERSONAS[who]
  const profile = { ...p, voice_core: core.core, signature_phrases: core.sig, voice_samples: core.samples.map((text, i) => ({ text, fit: core.fit[i], source: 'pasted' })) }
  return { userId: '', settings: buildAuthorSettings(profile, { rotation: 0 }), memory: emptyMemory() }
}

type Pair = { id: string; author: string; topic: string; format: string; full: string; simple: string; fullFirst: boolean; error?: string }

async function one(row: EvalRow, core: Core): Promise<Pair> {
  const base = { id: row.id, author: PERSONAS[row.who].full_name, topic: row.topic, format: row.format }
  try {
    const reqA: GenRequest = { topic: row.topic, format: row.format, intent: row.intent }
    const ctxA = ctxOf(row.who, core)
    let d = await draft(ctxA, reqA)
    if (d.kind === 'need_detail') d = await draft(ctxA, reqA, { plan: d.plan, skipDetail: true })
    if (d.kind !== 'text') throw new Error('план не дал текста')
    const r = await refine(ctxA, d.plan, reqA, d.text, d.findings)
    // простой путь пишет в тот же формат, что выбрала полная цепочка (для «подбери сама»)
    const s = await simpleWrite(ctxOf(row.who, core), { topic: row.topic, format: reqA.format, intent: row.intent })
    return { ...base, format: reqA.format, full: r.text, simple: s.text, fullFirst: Math.random() < 0.5 }
  } catch (e: any) {
    return { ...base, full: '', simple: '', fullFirst: true, error: String(e?.message || e) }
  }
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function html(pairs: Pair[], runId: string): string {
  const data = JSON.stringify(pairs.map(p => ({ id: p.id, author: p.author, topic: p.topic, format: p.format, error: p.error, v1: p.fullFirst ? p.full : p.simple, v2: p.fullFirst ? p.simple : p.full, v1is: p.fullFirst ? 'full' : 'simple' }))).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Слепое сравнение</title>
<style>
:root{--bg:#F7F3EC;--ink:#2E2A45;--muted:#6B6680;--acc:#5B4FA0;--soft:#E7E2F2;--line:#E4DED2}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px;z-index:2;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
h1{font-size:17px;margin:0;flex:1 1 auto}button{font:inherit;border:1px solid var(--line);background:#fff;border-radius:10px;padding:7px 12px;cursor:pointer;color:var(--ink)}
button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
main{max-width:1200px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:22px}
.pair{background:#fff;border:1px solid var(--line);border-radius:18px;padding:14px}
.meta{font-size:13px;color:var(--muted);margin-bottom:10px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:760px){.cols{grid-template-columns:1fr}}
.v{border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px}
.v.pick{border-color:var(--acc);box-shadow:0 0 0 2px var(--soft)}
pre{white-space:pre-wrap;font:inherit;margin:0}.who{font-size:12px;font-weight:600;color:var(--acc)}
.row{display:flex;gap:8px;flex-wrap:wrap}.res{font-weight:600}
</style></head><body>
<header><h1>Какой текст лучше? Выбирай вслепую</h1><span id="score" class="res"></span><button id="reveal">Показать, где что</button></header>
<main id="m"></main>
<script>
const D=${data};const KEY='ab-${runId}';let S={};try{S=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
let shown=false;const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
const name=k=>k==='full'?'полная цепочка':'простой путь';
function render(){const m=document.getElementById('m');m.innerHTML='';
D.forEach(d=>{const c=document.createElement('div');c.className='pair';const pick=S[d.id];
const lab=i=>shown?'<div class="who">'+(i===1?name(d.v1is):name(d.v1is==='full'?'simple':'full'))+'</div>':'';
c.innerHTML='<div class="meta"><b>'+esc(d.id)+'</b> · '+esc(d.author)+' · '+esc(d.format)+' · '+esc(d.topic)+'</div>'+(d.error?'<div>Ошибка: '+esc(d.error)+'</div>':'<div class="cols">'
+'<div class="v '+(pick==='1'?'pick':'')+'">'+lab(1)+'<pre>'+esc(d.v1)+'</pre><div class="row"><button data-p="1" class="'+(pick==='1'?'on':'')+'">Этот лучше</button></div></div>'
+'<div class="v '+(pick==='2'?'pick':'')+'">'+lab(2)+'<pre>'+esc(d.v2)+'</pre><div class="row"><button data-p="2" class="'+(pick==='2'?'on':'')+'">Этот лучше</button></div></div></div>'
+'<div class="row" style="margin-top:10px"><button data-p="0" class="'+(pick==='0'?'on':'')+'">Оба плохие</button></div>');
c.querySelectorAll('button[data-p]').forEach(b=>b.onclick=()=>{S[d.id]=b.dataset.p;save();render()});m.appendChild(c)});
let full=0,simple=0,bad=0;D.forEach(d=>{const p=S[d.id];if(!p)return;if(p==='0'){bad++;return}const k=p==='1'?d.v1is:(d.v1is==='full'?'simple':'full');k==='full'?full++:simple++});
document.getElementById('score').textContent=shown?('полная '+full+' · простой '+simple+' · оба плохие '+bad):(Object.keys(S).length+' из '+D.length+' выбрано')}
document.getElementById('reveal').onclick=()=>{shown=!shown;document.getElementById('reveal').textContent=shown?'Спрятать':'Показать, где что';render()};
render();
</script></body></html>`
}

async function main() {
  const ids = flag('ids').split(',').filter(Boolean)
  const rows = TOPICS.filter(r => (ids.length ? ids : DEFAULT_IDS).includes(r.id))
  console.log(`Модель: ${modelFor(true)}. Тем: ${rows.length}. Оценка: около ${rows.length * 40 + 30} ₽, время около ${Math.ceil(rows.length / 3) * 2} мин.`)
  if (!argv.includes('--yes')) { console.log('Это настоящие деньги. Запусти с --yes, если согласна.'); return }
  if (!process.env.OPENAI_API_KEY) throw new Error('Нет OPENAI_API_KEY в .env.local')
  const runId = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const out = join(TEST, 'ab', runId)
  mkdirSync(out, { recursive: true })
  const pairs: Pair[] = []
  const byWho = new Map<Who, EvalRow[]>()
  for (const r of rows) byWho.set(r.who, [...(byWho.get(r.who) || []), r])
  await Promise.all([...byWho.entries()].map(async ([who, list]) => {
    const core = await coreOf(who)
    for (const row of list) {
      const p = await one(row, core)
      pairs.push(p)
      console.log(`${p.id}: ${p.error ? 'ОШИБКА ' + p.error.slice(0, 100) : 'готово'}`)
      const ordered = rows.map(r => pairs.find(x => x.id === r.id)).filter(Boolean) as Pair[]
      writeFileSync(join(out, 'ab.json'), JSON.stringify(ordered, null, 2))
      writeFileSync(join(out, 'ab.html'), html(ordered, runId))
    }
  }))
  console.log(`\nГотово. Открой: open "${join(out, 'ab.html')}"`)
}

main().catch(e => { console.error(e); process.exit(1) })
