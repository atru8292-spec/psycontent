// Страница для чтения глазами (zh4, 21.10): планы тем (у каждой темы группа и угол, заезженные помечены),
// потом все новые тексты подряд: автор, формат, тема, что выбрал код (начало, конец, подпись). Бесплатно.
//   npx tsx scripts/read-page.ts --plans=<plans.json> --runs="Рилсы zh4:<папка>,Карусели:<папка>" --out=<файл.html> --title="..."
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { WORN, ANGLE_NAMES } from '../lib/generation/topics'
import { PERSONAS, type Who } from './eval-data'

const TEST = join(__dirname, '..', '_знания', 'мозг-генератора', 'test')
const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const CAP: Record<string, string> = { dobavit: 'добавить, без действия', vopros: 'вопрос', podpiska: 'подписка', zapis: 'запись' }
const LEN: Record<string, string> = { korotko: 'одна строка', sredne: 'средне', razvernuto: 'развернуто' }

const parts: string[] = []
const nav: string[] = []
const plansFile = flag('plans')
if (plansFile && existsSync(plansFile)) {
  const plans = JSON.parse(readFileSync(plansFile, 'utf8'))
  nav.push('<a href="#plans">Планы тем</a>')
  parts.push('<h2 id="plans">Планы тем</h2><p class="m">У каждой темы угол и группа. Заезженные круги (мама и детство, нарциссы и типы, тревога и депрессия) помечены.</p>')
  for (const who of Object.keys(plans)) {
    parts.push(`<div class="c"><b>${esc(PERSONAS[who as Who].full_name)}</b> · ${esc(PERSONAS[who as Who].one_niche)}<ol>` +
      plans[who].topics.map((t: any) => `<li>${esc(t.title)} <span class="m">· ${esc(ANGLE_NAMES[t.angle] || t.angle)} · ${esc(t.group)}</span>${WORN.includes(t.group) ? ' <span class="w">заезженный круг</span>' : ''}</li>`).join('') + '</ol></div>')
  }
}
let total = 0
for (const spec of flag('runs').split(',').filter(Boolean)) {
  const [name, dir] = spec.split(':')
  const f = join(TEST, 'eval', dir, 'results.json')
  if (!existsSync(f)) { console.warn(`нет ${f}`); continue }
  const rows = JSON.parse(readFileSync(f, 'utf8')).filter((r: any) => !r.error && r.text)
  const id = dir.replace(/[^a-z0-9]/gi, '')
  nav.push(`<a href="#${id}">${esc(name)} (${rows.length})</a>`)
  parts.push(`<h2 id="${id}">${esc(name)}: ${rows.length}</h2>`)
  rows.forEach((r: any, i: number) => {
    const z = r.plan?.zh4 || {}
    const picks = [z.start ? `начало ${z.start}` : '', z.end ? `конец ${z.end}` : '', z.caption ? `подпись: ${CAP[z.caption] || z.caption}, ${LEN[z.len] || z.len}${z.vizitka ? ', с визиткой' : ''}` : '',
      z.cover ? `обложка ${z.cover}` : '', z.karEnd ? `последний слайд ${z.karEnd}` : '', z.karShag ? 'слайд с шагом' : '', z.detail ? 'предложена рабочая деталь' : '',
      // zh5: длина, призыв голосом, петля, обращение, мат, реплика в подписи
      z.rlen ? `длина ${z.rlen} (${z.words})` : '', z.prizyv ? 'призыв голосом' : '', z.loop ? 'петля можно' : '', z.addr ? 'обращение можно' : '', z.mat === true ? 'мат можно' : z.mat === false ? 'без мата' : '', z.replika ? 'реплика в подписи можно' : ''].filter(Boolean).join(' · ')
    parts.push(`<div class="c"><div class="m">${i + 1}. ${esc(r.author)} · ${esc(r.format)} · «${esc(r.topic)}»${picks ? `<br>${esc(picks)}` : ''}</div><pre>${esc(r.text)}</pre></div>`)
    total++
  })
}
const title = flag('title') || 'Все тексты'
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;background:#F5EFE4;color:#3B2A22;font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}main{max-width:760px;margin:0 auto;padding:16px}nav{position:sticky;top:0;background:#F5EFE4;padding:10px 0;border-bottom:1px solid #E3DACB;display:flex;gap:14px;flex-wrap:wrap}nav a{color:#33472B}h2{margin:28px 0 8px}.c{background:#fff;border:1px solid #E3DACB;border-radius:14px;padding:14px;margin:12px 0;overflow-wrap:anywhere}.m{font-size:13px;color:#6B6458;margin-bottom:8px}.w{font-size:12px;background:#EDE4F7;border-radius:8px;padding:1px 6px}pre{white-space:pre-wrap;font:inherit;margin:0}ol{padding-left:22px}li{margin:4px 0}</style>
<main><h1>${esc(title)} (${total})</h1><nav>${nav.join(' ')}</nav>${parts.join('\n')}</main></html>`
writeFileSync(flag('out'), html)
console.log(`Готово: ${flag('out')} (${total} текстов)`)
