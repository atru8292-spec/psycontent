// Сборка промпта простого пути без денег: fetch подменен, модель не вызывается. Печатает системный и
// пользовательский промпт, которые ушли бы в OpenAI (после обезличивания), для одной темы тестового психолога.
//   PROMPT_HYP=zh3,h7 npx tsx scripts/dry-prompt.ts --who=B --format=reels_otvet --intent=obyasnenie --topic="..." [--dlya="..."]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildAuthorSettings } from '../lib/generation/settings'
import { simpleWrite } from '../lib/generation/simple'
import type { GenContext } from '../lib/generation/pipeline'
import type { FormatCode } from '../lib/generation/text-guard'
import { PERSONAS, type Who } from './eval-data'

const argv = process.argv.slice(2)
const flag = (name: string) => (argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=')
const who = (flag('who') || 'B') as Who
process.env.OPENAI_API_KEY = 'dry-run'
process.env.GENERATION_CUT = '0'
const sent: any[] = []
;(globalThis as any).fetch = async (_url: string, init: any) => {
  const body = JSON.parse(init.body)
  sent.push(body)
  // скелет zh5b ждет JSON: заглушка отдает пример, чтобы было видно, как скелет попадает в промпт писателя
  const sk = /^Ты психолог\. Перед тем как записать ролик/u.test(body.messages?.[0]?.content || '')
  const content = sk ? JSON.stringify({ mysl: '[мысль из скелета]', pochemu: ['[причина 1]', '[причина 2]'], primer: '[пример]', obraz: '' }) : 'Речь: заглушка.'
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const coreFile = join(__dirname, '..', '_знания', 'мозг-генератора', 'test', 'eval', `voice_core_${who}_rilsy.json`)
const core = existsSync(coreFile) ? JSON.parse(readFileSync(coreFile, 'utf8')) : { core: '', sig: [], fit: [], samples: [] }
const dlya = flag('dlya')
const p = dlya ? { ...PERSONAS[who], audience: dlya, one_niche: dlya, client_pain_phrases: '', position_text: '', story_bank: [] } : PERSONAS[who]
const profile = { ...p, voice_core: core.core, signature_phrases: core.sig, voice_samples: core.samples.map((text: string, i: number) => ({ text, fit: core.fit[i], source: 'pasted' })) }
const memory = { count: Number(flag('count')) || 0, lastHookTypes: [], lastArcs: [], lastOpenings: [], lastEndings: [], lastRings: [], lastIntents: [], lastFormats: [], usedClientPhrases: [], usedDetails: [], usedSignaturePhrases: [], recentTopics: [], feedbackReasons: [] }
const ctx: GenContext = { userId: '', settings: buildAuthorSettings(profile, { rotation: 0 }), memory } as any
simpleWrite(ctx, { topic: flag('topic') || 'тема', format: (flag('format') || 'reels_monolog') as FormatCode, intent: flag('intent') || 'uznavanie' } as any).then(() => {
  // вызов писателя: самый длинный системный промпт (скелет и ножницы короче)
  const w = [...sent].sort((a, b) => (b.messages?.[0]?.content || '').length - (a.messages?.[0]?.content || '').length)[0]
  if (sent.length > 1) console.log(`(вызовов: ${sent.length}, показан писатель)`)
  for (const x of w?.messages || []) console.log(`\n===== ${x.role} =====\n${x.content}`)
})
