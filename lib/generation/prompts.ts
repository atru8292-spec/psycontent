// Сборка промптов новой цепочки генерации из дословных текстов (prompts.generated.ts).
// Тексты промптов не менять здесь: они живут в _знания/мозг-генератора/03-PROMPTY.md.
// Тут только подстановка плейсхолдеров {{...}} и справочники, которые код берет из тех же текстов.

import {
  BASE_SETTINGS_TEMPLATE, P0_SYSTEM, P0_USER, P1_SYSTEM, P1_USER, P2_SYSTEM, P2_USER,
  INTENT_CARDS, FORMAT_CARDS, P4_SYSTEM, P4_USER, P5_SYSTEM, P5_USER, P6_PROMPT, P8_PROMPT, P2V_PROMPT, P2P_SYSTEM, P2P_USER,
  BUTTON_MODE_LINE, BUTTONS,
} from './prompts.generated'

export { P2P_SYSTEM }
export { P0_SYSTEM, P1_SYSTEM, P4_SYSTEM, INTENT_CARDS, FORMAT_CARDS, BUTTONS, BUTTON_MODE_LINE }

export type Vars = Record<string, string | number | boolean | null | undefined>

// Подстановка {{key}} и {{key | значение по умолчанию}}.
// Пустое значение без умолчания: строка целиком выкидывается («пустые поля не выводятся»).
// Умолчание «не выводить, если пусто»: строка выкидывается.
export function fill(tpl: string, vars: Vars): string {
  const out: string[] = []
  for (const line of tpl.split('\n')) {
    let drop = false
    const replaced = line.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?))?\s*\}\}/g, (_m, key: string, def?: string) => {
      const v = vars[key]
      const empty = v === undefined || v === null || String(v).trim() === ''
      if (!empty) return String(v)
      if (def !== undefined) {
        if (/^не выводить/.test(def.trim())) { drop = true; return '' }
        return def.trim()
      }
      drop = true
      return ''
    })
    if (!drop) out.push(replaced)
  }
  return out.join('\n')
}

// ---------- справочники из текста П1 ----------
// Коды хуков с описаниями и какие хуки подходят какому смыслу. Берем из самого промпта,
// чтобы П6 и проверки видели то же, что видит план.
function parseHookDescriptions(): Record<string, string> {
  const res: Record<string, string> = {}
  const part = P1_SYSTEM.split('Коды хуков')[1]?.split('Типы финалов')[0] || ''
  for (const l of part.split('\n')) {
    const m = l.match(/^- ([a-z_]+): (.+)$/)
    if (m) res[m[1]] = m[2].trim()
  }
  return res
}
function parseIntentHooks(): Record<string, string[]> {
  const res: Record<string, string[]> = {}
  const part = P1_SYSTEM.split('Смыслы (код')[1]?.split('Коды хуков')[0] || ''
  for (const l of part.split('\n')) {
    const m = l.match(/^- ([a-z_]+): .*?Хуки: ([a-z_, ]+)/)
    if (m) res[m[1]] = m[2].split(',').map(s => s.trim()).filter(Boolean)
  }
  return res
}
export const HOOK_DESCRIPTIONS = parseHookDescriptions()
export const INTENT_HOOKS = parseIntentHooks()
export const INTENT_CODES = Object.keys(INTENT_CARDS)

// Кнопки «Что дать читателю» на экране и смыслы внутри (02-ARHITEKTURA.md).
export const INTENT_BUTTONS: Record<string, string[]> = {
  podderzhat: ['podderzhka', 'uznavanie', 'dlya_blizkih'],
  obyasnit: ['mehanizm', 'obyasnenie', 'perevod_repliki', 'mif'],
  razreshit: ['razreshenie', 'malenkiy_shag'],
  kak_v_terapii: ['kak_v_terapii'],
  skazat_chto_dumayu: ['poziciya', 'svoya_istoriya'],
  rassmeshit: ['yumor'],
  pozvat: ['priglashenie'],
}

// ---------- сборщики промптов ----------

export function buildBaseSettings(v: Vars): string {
  return fill(BASE_SETTINGS_TEMPLATE, v)
}

export function buildP0User(samples: string[]): string {
  const head = P0_USER.split('<образец 1>')[0]
  const tail = P0_USER.split('</образец N>')[1] || ''
  const body = samples.map((s, i) => `<образец ${i + 1}>\n${s}\n</образец ${i + 1}>`).join('\n\n')
  return `${head}${body}${tail}`
}

export function buildP1User(v: Vars): string {
  return fill(P1_USER, v)
}

export function buildP2System(v: Vars): string {
  return fill(P2_SYSTEM, v)
}

export function buildP2User(v: Vars): string {
  return fill(P2_USER, v)
}

export function buildP4User(v: Vars): string {
  return fill(P4_USER, v)
}

// П4-мини: тот же промпт П4, код сужает вопросы (03-PROMPTY.md, «Что делает код с результатом»).
export function buildP4MiniUser(v: Vars, changedFragments: string): string {
  return `${fill(P4_USER, v)}

Режим П4-мини. Проверь только эти вопросы: vydumka, etika и shtampy по измененным фрагментам ниже (и по одной фразе до и после них), forma и tiki по всему тексту, и дополнительный вопрос svyaznost: «правка не сломала связность (фраза без контекста, местоимение не к чему отнести) и не повторила одно слово дважды рядом?». Остальные вопросы не проверяй и не включай в checks.

<измененные_фрагменты>
${changedFragments}
</измененные_фрагменты>`
}

export function buildP5System(v: Vars): string {
  return fill(P5_SYSTEM, v)
}

export function buildP5User(v: Vars, wholeTextMode = false): string {
  const body = fill(P5_USER, v)
  return wholeTextMode ? `${BUTTON_MODE_LINE}\n\n${body}` : body
}

export function buildP6(v: Vars): string {
  return fill(P6_PROMPT, v)
}

export function buildP2P(v: Vars): string {
  return fill(P2P_USER, v)
}

export function buildP2V(v: Vars): string {
  return fill(P2V_PROMPT, v)
}

export function buildP8(v: Vars): string {
  return fill(P8_PROMPT, v)
}

export function allowedHooksWithDescriptions(intent: string): string {
  const codes = INTENT_HOOKS[intent] || []
  return codes.map(c => `${c}: ${HOOK_DESCRIPTIONS[c] || ''}`).join('; ')
}
