// Слепое сравнение вариантов промпта для Арины: по каждой теме тексты всех вариантов рядом в случайном порядке,
// имя варианта скрыто, в тему подмешан один живой текст того же вида. Под каждым текстом «Живой»,
// «Так можно публиковать», «Нейросеть» (ответы в localStorage), внизу «Показать, где что» и счет по вариантам.
// Бесплатно, без модели.
//
//   npx tsx scripts/compare.ts --runs=h0:<папка прогона>,h1:<папка>,...
//   (без «имя:» имя варианта берется из конца папки: ..._h2 -> h2)
// Результат: _знания/мозг-генератора/test/gipotezy/<дата>/compare.html

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { LIVE_EXAMPLES } from '../lib/generation/examples'
import { plainText } from './turing-text'
import { livePosts } from './turing'
import { TOPICS_KARUSELI } from './eval-data'

const TEST = join(__dirname, '..', '_знания', 'мозг-генератора', 'test')
const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')

type Card = { v: string; text: string; caption: string }
type Topic = { id: string; topic: string; author: string; format: string; cards: Card[] }

function caption(text: string): string {
  const i = String(text || '').search(/^\s*Подпись\s*:/mu)
  return i < 0 ? '' : text.slice(i).replace(/^\s*Подпись\s*:\s*/u, '').trim()
}

function shuffle<T>(a: T[], seed: number): T[] {
  const r = [...a]
  let s = seed
  for (let i = r.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 233280, 7)

function main() {
  const runs = flag('runs').split(',').filter(Boolean).map(x => {
    const [a, b] = x.includes(':') ? x.split(':') : [(x.match(/_(h[\w+-]+)$/) || [, x])[1] as string, x]
    return { name: a, dir: b }
  })
  if (!runs.length) throw new Error('Укажи --runs=h0:<папка>,h1:<папка>,...')
  const topics = new Map<string, Topic>()
  for (const { name, dir } of runs) {
    const f = join(TEST, 'eval', dir, 'results.json')
    if (!existsSync(f)) { console.warn(`нет прогона ${dir}`); continue }
    for (const r of JSON.parse(readFileSync(f, 'utf8'))) {
      if (r.error || !r.text) continue
      const t: Topic = topics.get(r.id) || { id: r.id, topic: r.topic, author: r.author, format: r.format, cards: [] }
      t.cards.push({ v: name, text: plainText(r.text), caption: caption(r.text) })
      topics.set(r.id, t)
    }
  }
  // живой текст того же вида: посты из Telegram к постам, ролики своего вида к рилсам, список к карусели
  const posts = livePosts()
  const usedLive = new Set<string>()
  for (const t of topics.values()) {
    let live: Card | null = null
    if (t.format === 'post' || t.format === 'post_tg') {
      const p = posts.find(x => !usedLive.has(x.id))
      if (p) { usedLive.add(p.id); live = { v: 'живой', text: p.text, caption: '' } }
    } else if (t.format === 'carousel') {
      // живая карусель из банка (без помеченных как нейросеть)
      const bank = JSON.parse(readFileSync(join(__dirname, '..', 'lib', 'generation', 'live-bank.json'), 'utf8')) as any[]
      // того же вида, что ждали в теме (TOPICS_KARUSELI.vid); живых мало, поэтому одна может встретиться дважды
      const vid = TOPICS_KARUSELI.find(r => r.id === t.id.replace(/_[a-z0-9]+$/i, '') || r.id === t.id)?.vid
      const good = bank.filter(x => x.kind === 'karusel' && !x.ai_like)
      const k = good.find(x => vid && x.sub === vid && !usedLive.has(x.id)) || good.find(x => vid && x.sub === vid) || good.find(x => !usedLive.has(x.id))
      if (k) { usedLive.add(k.id); live = { v: 'живой', text: k.text, caption: '' } }
    } else {
      const want = t.format
      const e = LIVE_EXAMPLES.find(x => x.format === want && !usedLive.has(x.id))
        || LIVE_EXAMPLES.find(x => x.format === 'reels_monolog' && !usedLive.has(x.id))
      if (e) { usedLive.add(e.id); live = { v: 'живой', text: plainText(e.text), caption: caption(e.text) } }
    }
    if (live) t.cards.push(live)
    t.cards = shuffle(t.cards, hash(t.id))
  }
  const list = [...topics.values()]
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const out = join(TEST, 'gipotezy', stamp)
  mkdirSync(out, { recursive: true })
  // --out=compare-karuseli.html для прогона каруселей
  const file = flag('out') || 'compare.html'
  writeFileSync(join(out, file), page(list, runs.map(r => r.name), stamp))
  writeFileSync(join(out, 'compare.json'), JSON.stringify({ runs, topics: list }, null, 2))
  console.log(`Тем: ${list.length}, вариантов: ${runs.length}. Открой: open "${join(out, file)}"`)
}

function page(topics: Topic[], variants: string[], stamp: string): string {
  const data = JSON.stringify(topics).replace(/</g, '\\u003c')
  const vars = JSON.stringify([...variants, 'живой'])
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Варианты вслепую</title>
<style>
:root{--bg:#F7F3EC;--ink:#2E2A45;--muted:#6B6680;--acc:#5B4FA0;--soft:#E7E2F2;--line:#E4DED2;--ok:#5F7A3A;--bad:#B4533F;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#1d1b26;--ink:#ece9f5;--muted:#a7a2bb;--soft:#2e2a45;--line:#3a3650;--card:#262331}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
h1{font-size:17px;margin:0;flex:1 1 auto}.n{font-size:13px;color:var(--muted)}
main{max-width:1500px;margin:0 auto;padding:16px}
section{margin:0 0 32px}h2{font-size:16px;margin:0 0 4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-top:10px}
.c{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px}
.t{white-space:pre-wrap}.cap{white-space:pre-wrap;font-size:14px;color:var(--muted);border-top:1px dashed var(--line);padding-top:8px}
.row{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}
button{font:inherit;font-size:14px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:6px 10px;cursor:pointer}
button.on{background:var(--acc);border-color:var(--acc);color:#fff}button.on.bad{background:var(--bad);border-color:var(--bad)}button.on.ok{background:var(--ok);border-color:var(--ok)}
.who{display:none;font-weight:600;color:var(--acc)}body.reveal .who{display:block}
table{border-collapse:collapse;width:100%;max-width:640px;background:var(--card)}td,th{border:1px solid var(--line);padding:6px 10px;text-align:left}
#score{display:none}body.reveal #score{display:block}
</style></head><body>
<header><h1>Варианты вслепую</h1><span class="n" id="cnt"></span><button id="rev">Показать, где что</button></header>
<main><p class="n">Прочитай тексты каждой темы и отметь: «Живой» (похоже на живого психолога), «Так можно публиковать», «Нейросеть». Один текст в каждой теме настоящий. Ответы сохраняются в этом браузере.</p>
<div id="app"></div>
<div id="score"><h2>Счет по вариантам</h2><div id="tbl"></div></div></main>
<script>
const T=${data};const V=${vars};const KEY='psycont_compare_${stamp}';
let S={};try{S=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
const app=document.getElementById('app');
T.forEach((t,ti)=>{const sec=document.createElement('section');
sec.innerHTML='<h2>'+(ti+1)+'. '+esc(t.topic)+'</h2><div class="n">'+esc(t.author)+' · '+esc(t.format)+'</div>';
const g=document.createElement('div');g.className='grid';
t.cards.forEach((c,ci)=>{const k=t.id+'#'+ci;const d=document.createElement('div');d.className='c';
d.innerHTML='<div class="who">'+esc(c.v)+'</div><div class="t">'+esc(c.text)+'</div>'+(c.caption?'<div class="cap">'+esc(c.caption)+'</div>':'')+
'<div class="row"><button data-a="live">Живой</button><button data-a="pub" class="okb">Так можно публиковать</button><button data-a="ai" class="badb">Нейросеть</button></div>';
const paint=()=>{const s=S[k]||{};d.querySelectorAll('button').forEach(b=>{const a=b.dataset.a;const on=a==='pub'?!!s.pub:s.lab===a;b.classList.toggle('on',on);b.classList.toggle('ok',a==='pub');b.classList.toggle('bad',a==='ai')})};
d.querySelectorAll('button').forEach(b=>b.onclick=()=>{const s=S[k]||(S[k]={});const a=b.dataset.a;if(a==='pub')s.pub=!s.pub;else s.lab=s.lab===a?null:a;save();paint();count()});
paint();g.appendChild(d)});sec.appendChild(g);app.appendChild(sec)});
function count(){let n=0;Object.values(S).forEach(s=>{if(s.lab||s.pub)n++});document.getElementById('cnt').textContent='Отмечено: '+n;
const r={};V.forEach(v=>r[v]={live:0,pub:0,ai:0,all:0});
T.forEach(t=>t.cards.forEach((c,ci)=>{const s=S[t.id+'#'+ci]||{};const x=r[c.v];if(!x)return;x.all++;if(s.lab==='live')x.live++;if(s.lab==='ai')x.ai++;if(s.pub)x.pub++}));
document.getElementById('tbl').innerHTML='<table><tr><th>Вариант</th><th>Текстов</th><th>Живой</th><th>Публиковать</th><th>Нейросеть</th></tr>'+V.map(v=>'<tr><td>'+esc(v)+'</td><td>'+r[v].all+'</td><td>'+r[v].live+'</td><td>'+r[v].pub+'</td><td>'+r[v].ai+'</td></tr>').join('')+'</table>'}
count();
document.getElementById('rev').onclick=()=>{document.body.classList.toggle('reveal');document.getElementById('rev').textContent=document.body.classList.contains('reveal')?'Скрыть':'Показать, где что'};
</script></body></html>`
}

main()
