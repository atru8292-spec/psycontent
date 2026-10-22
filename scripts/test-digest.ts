// Утренняя сводка без базы.  npx tsx scripts/test-digest.ts
import assert from 'node:assert/strict'
import { buildDigest, demoDigest, digestFrom, yesterdayIn, shortId } from '../lib/analytics/digest'
import { demoPeople, demoOverview } from '../lib/analytics/demo'

const t = buildDigest(demoDigest())
assert.ok(t.includes('Новых: 4') && t.includes('Застряли: 3') && t.includes('риск 60+: 2'))
assert.ok(!/@/.test(t), 'в сводке нет почт')
assert.ok(!/[—ё]/u.test(t), 'без длинных тире и ё')
// из демо-людей кабинета: почты в людях есть, в текст они не попадают
const y = yesterdayIn('Asia/Barnaul', new Date('2026-10-24T03:00:00Z'))
assert.equal(y.label, '23 октября')
const people = demoPeople()
const text = buildDigest(digestFrom({ label: y.label, from: y.from, to: y.to, people, overview: demoOverview(), aiRubDay: 10, aiRubMonth: 100, onboarded: 1, genErrors: 0, profileChecks: 0, exits: [] }))
for (const p of people) if (p.email) assert.ok(!text.includes(p.email), 'почта в сводке')
assert.ok(text.includes('новых ответов нет'))
assert.equal(shortId('00000000-0000-4000-8000-000000000012'), '0012')
console.log('ok: утренняя сводка')
