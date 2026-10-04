// Собирает lib/generation/prompts.generated.ts из docs/prompts/03-PROMPTY.md (с 04.10 промпты живут в репо;
// копия в _знания/мозг-генератора больше не источник).
// Промпты живут в документе, в коде только их дословная копия. После правки документа:
//   node scripts/build-prompts.mjs
// Руками prompts.generated.ts не править.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'docs', 'prompts', '03-PROMPTY.md')
const out = join(root, 'lib', 'generation', 'prompts.generated.ts')

const md = readFileSync(src, 'utf8').replace(/\r\n/g, '\n')
const lines = md.split('\n')

// Разбор: для каждого раздела «## ...» список блоков кода с пометкой, какой это промпт.
const sections = []
let cur = null
let label = null
let inCode = false
let buf = []
for (const line of lines) {
  if (!inCode && line.startsWith('## ')) {
    cur = { title: line.slice(3).trim(), blocks: [], text: [] }
    sections.push(cur)
    label = null
    continue
  }
  if (line.startsWith('```')) {
    if (!inCode) { inCode = true; buf = []; continue }
    inCode = false
    if (cur) cur.blocks.push({ label, body: buf.join('\n') })
    label = null
    continue
  }
  if (inCode) { buf.push(line); continue }
  if (/^\*\*Системный промпт/.test(line)) label = 'system'
  else if (/^\*\*Пользовательский промпт/.test(line)) label = 'user'
  else if (/^\*\*Правило рилса/.test(line)) label = 'reels'
  if (cur) cur.text.push(line)
}

const find = (prefix) => {
  const s = sections.find(x => x.title.startsWith(prefix))
  if (!s) throw new Error(`Нет раздела «${prefix}» в 03-PROMPTY.md`)
  return s
}
const pick = (s, lbl) => {
  const b = s.blocks.find(x => x.label === lbl)
  if (!b) throw new Error(`В разделе «${s.title}» нет блока ${lbl}`)
  return b.body
}
const cards = (s) => {
  const res = {}
  for (const b of s.blocks) {
    const m = b.body.match(/^\[([a-z_]+)\]/)
    if (!m) throw new Error(`Карточка без кода в разделе «${s.title}»`)
    res[m[1]] = b.body
  }
  return res
}

const base = find('Базовые настройки')
const p0 = find('П0.')
const p0b = find('П0б')
const p1 = find('П1.')
const p2 = find('П2.')
const intents = find('Карточки смыслов')
const skeletons = find('Скелеты')
const formats = find('Карточки форматов')
const p4 = find('П4.')
const p5 = find('П5.')
const p6 = find('П6.')
const p8 = find('П8.')
const p2v = find('П2в')
const p2p = find('П2п')
const pp = find('ПП.')
const pn = find('ПН.')
const pzh = find('ПЖ.')
const ym = find('ЯМ.')
const yp = find('ЯП.')
const tzh = find('ТЖ.')
const moves = find('Ходы ПЖ')
const buttons = find('Кнопки')

const btn = {}
for (const l of buttons.text) {
  const m = l.match(/^- \*\*(.+?)\*\*:\s*«(.*)»\s*$/)
  if (m) btn[m[1]] = m[2]
}
const modeLine = buttons.text.join('\n').match(/добавляет строку «(.+?)»\./)
if (!modeLine) throw new Error('Не нашла строку режима кнопок')

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const str = (s) => '`' + esc(s) + '`'
const obj = (o) => '{\n' + Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: ${str(v)},`).join('\n') + '\n}'

const ts = `// АВТОСБОРКА из docs/prompts/03-PROMPTY.md (scripts/build-prompts.mjs).
// Руками не править: поправь документ и запусти node scripts/build-prompts.mjs.
/* eslint-disable */

export const BASE_SETTINGS_TEMPLATE = ${str(base.blocks[0].body)}

export const P0_SYSTEM = ${str(pick(p0, 'system'))}
export const P0_USER = ${str(pick(p0, 'user'))}

export const P0B_SYSTEM = ${str(pick(p0b, 'system'))}
export const P0B_USER = ${str(pick(p0b, 'user'))}

export const P1_SYSTEM = ${str(pick(p1, 'system'))}
export const P1_USER = ${str(pick(p1, 'user'))}

export const P2_SYSTEM = ${str(pick(p2, 'system'))}
export const P2_USER = ${str(pick(p2, 'user'))}

export const INTENT_CARDS: Record<string, string> = ${obj(cards(intents))}

export const FORMAT_CARDS: Record<string, string> = ${obj(cards(formats))}

export const SKELETONS: Record<string, string> = ${obj(cards(skeletons))}

export const P4_SYSTEM = ${str(pick(p4, 'system'))}
export const P4_USER = ${str(pick(p4, 'user'))}

export const P5_SYSTEM = ${str(pick(p5, 'system'))}
export const P5_USER = ${str(pick(p5, 'user'))}

export const P6_PROMPT = ${str(p6.blocks[0].body)}

export const P8_PROMPT = ${str(p8.blocks[0].body)}

export const P2V_PROMPT = ${str(p2v.blocks[0].body)}

export const P2P_SYSTEM = ${str(pick(p2p, 'system'))}
export const P2P_USER = ${str(pick(p2p, 'user'))}

export const PP_SYSTEM = ${str(pick(pp, 'system'))}
export const PP_USER = ${str(pick(pp, 'user'))}
export const PP_REELS = ${str(pick(pp, 'reels'))}

export const PZH_SYSTEM = ${str(pick(pzh, 'system'))}
export const PZH_MOVES: Record<string, string> = ${obj(cards(moves))}

export const YM_SYSTEM = ${str(pick(ym, 'system'))}
export const YM_USER = ${str(pick(ym, 'user'))}
export const YP_SYSTEM = ${str(pick(yp, 'system'))}
export const YP_USER = ${str(pick(yp, 'user'))}
export const TZH_SYSTEM = ${str(pick(tzh, 'system'))}
export const TZH_USER = ${str(pick(tzh, 'user'))}

export const PN_SYSTEM = ${str(pick(pn, 'system'))}
export const PN_USER = ${str(pick(pn, 'user'))}

export const BUTTON_MODE_LINE = ${str(modeLine[1])}
export const BUTTONS: Record<string, string> = ${obj(btn)}
`
writeFileSync(out, ts)
console.log('ok:', out, 'intents', Object.keys(cards(intents)).length, 'formats', Object.keys(cards(formats)).length, 'buttons', Object.keys(btn).length)
