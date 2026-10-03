// Этап 2 «обратного промпта»: для каждого живого текста из scripts/obratno-data.ts
// 1) модель (gpt-5.4) пишет промпт, по которому другая модель напишет текст ТАКОГО ЖЕ УСТРОЙСТВА на другую тему;
// 2) рядом мой обратный промпт (obratno-data.ts);
// 3) по каждому промпту текст на две новые темы (модель генерации, как в продукте).
//   npx tsx --env-file=.env.local scripts/obratno.ts --yes [--ids=r12,r17]
// Результат: _знания/мозг-генератора/test/obratno/<дата>/<id>.md и ВСЕ.md

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { callModel } from '../lib/generation/ai'
import { finalNet } from '../lib/generation/text-guard'
import { PERSONAS, TOPICS_RAZNYE } from './eval-data'
import { SOURCES, type Src } from './obratno-data'

const ROOT = join(__dirname, '..')
const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
const bank = JSON.parse(readFileSync(join(ROOT, 'lib', 'generation', 'live-bank.json'), 'utf8')) as { id: string; text: string; words: number }[]

const REVERSE_SYSTEM = `Ты пишешь промпты для другой модели. Тебе дают живой текст психолога (расшифровка ролика Reels или пост в Telegram). Напиши промпт, по которому другая модель напишет текст ТАКОГО ЖЕ УСТРОЙСТВА на другую тему, которую ей дадут отдельно.

Это не пересказ текста. Опиши: кто говорит и из какого положения (в каком он состоянии, что его задело), по какому поводу он заговорил, с чего начинает, как движется мысль (прямо, по кругу, с отступлениями, с повтором), какой длины и ритма фразы, что остается необъясненным, где и как звучит эмоция, как текст кончается, примерная длина в словах. Без цитат из текста, без его темы и его примеров. Промпт обращен к модели на «ты», 120-220 слов, без тире.

Верни только промпт.`

function authorLine(who: 'A' | 'B' | 'C'): string {
  const p = PERSONAS[who]
  const addr = p.reader_address === 'ty' ? 'на «ты»' : p.reader_address === 'vy_devochki' ? 'на «вы», можно «девочки»' : 'на «вы»'
  const mat = p.profanity === 'free' ? 'автор матерится как в жизни: мат есть, в речи слово целиком, в посте со звездочкой' : 'без мата'
  return `Автор: ${p.full_name}, ${p.author_gender === 'male' ? 'психолог-мужчина' : 'психолог-женщина'}, подход ${p.approaches.join(', ')}. К читателю ${addr}. ${mat}. Факты о жизни автора не выдумывай; если нужен случай из жизни, бери обычный для всех.`
}

async function write(prompt: string, src: Src, topicId: string): Promise<string> {
  const t = TOPICS_RAZNYE.find(x => x.id === topicId)!
  const fmt = src.format === 'reels' ? 'расшифровка ролика Reels: только то, что автор говорит, без меток и подписей' : 'пост в Telegram'
  const user = `${authorLine(src.who)}\nАудитория: ${t.dlya}.\nФормат: ${fmt}.\nТема: ${t.topic}\n\nВерни только текст.`
  const text = await callModel({ system: prompt + '\n\nБез тире, без буквы «ё».', user, effort: 'medium', verbosity: 'medium', maxTokens: 6000, writer: true, operation: 'obratno_write' })
  return finalNet(text)
}

async function one(src: Src) {
  const live = bank.find(b => b.id === src.id)
  if (!live) throw new Error(`нет ${src.id} в live-bank.json`)
  const theirs = await callModel({ system: REVERSE_SYSTEM, user: `<текст>\n${live.text}\n</текст>`, model: 'gpt-5.4', effort: 'medium', verbosity: 'medium', maxTokens: 4000, operation: 'obratno_reverse' })
  const texts: Record<string, string> = {}
  for (const [name, prompt] of [['модель', theirs], ['мой', src.mine]] as const) {
    for (const topicId of src.topics) texts[`${name}|${topicId}`] = await write(prompt, src, topicId).catch(e => `ОШИБКА ${e?.message || e}`)
  }
  return { src, live, theirs, texts }
}

async function main() {
  if (!argv.includes('--yes')) { console.log('Это деньги (около 3 ₽ на исходник). Запусти с --yes.'); return }
  const ids = flag('ids').split(',').filter(Boolean)
  const list = ids.length ? SOURCES.filter(s => ids.includes(s.id)) : SOURCES
  const out = join(ROOT, '_знания', 'мозг-генератора', 'test', 'obratno', new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-'))
  mkdirSync(out, { recursive: true })
  const q = [...list]
  const all: string[] = []
  await Promise.all([0, 1, 2, 3].map(async () => {
    for (let s = q.shift(); s; s = q.shift()) {
      const r = await one(s)
      const topic = (id: string) => TOPICS_RAZNYE.find(x => x.id === id)!.topic
      const md = [
        `# ${s.id} (${s.format}, автор ${PERSONAS[s.who].full_name})`, '',
        '## Исходник', '', '```', r.live.text, '```', '',
        '## Обратный промпт модели (gpt-5.4)', '', '```', r.theirs, '```', '',
        '## Мой обратный промпт', '', '```', s.mine, '```', '',
        ...Object.entries(r.texts).flatMap(([k, v]) => { const [who, tid] = k.split('|'); return [`## Текст по промпту: ${who}, тема «${topic(tid)}»`, '', '```', v, '```', ''] }),
        '## Вывод', '', '(дописывается после чтения)', '',
      ].join('\n')
      writeFileSync(join(out, `${s.id.replace('#', '_')}.md`), md)
      all.push(md)
      console.log(`${s.id}: готово`)
    }
  }))
  writeFileSync(join(out, 'ВСЕ.md'), all.join('\n\n---\n\n'))
  console.log(`Папка: ${out}`)
}

main().catch(e => { console.error(e); process.exit(1) })
