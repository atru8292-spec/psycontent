// zh13: тест смеси без модели. 20 подборов «Подбери сам» подряд для одного психолога: темы по кругу (в том числе
// тяжелая «Утрата и горе», где спорного тезиса не бывает), ранжирование как будто от модели (перемешано детерминированно
// по теме), смесь и хуки считает код (smes.ts). Печатает цели, форматы и хуки по порядку, пишет JSON для страницы.
//   npx tsx scripts/zh13-smes.ts [выход.json]
import { writeFileSync } from 'node:fs'
import { FORMATY, CELI, HUKI_IMYA, formatPo } from '../lib/generation/zh13/formaty'
import { vybratFormat, dostupen, KVOTA, type Proshlyy } from '../lib/generation/zh13/smes'
import { scenaDlya } from '../lib/generation/zh13/sceny'

const TEMY = ['Тревога и накручивание', 'Мамы и взрослые дочери', 'Выгорание', 'Ревность', 'Утрата и горе', 'Внутренний критик', 'Смена профессии', 'Депрессия и апатия']
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h }

export function progonSmesi(n = 20) {
  const ist: Proshlyy[] = []
  const out: { i: number; tema: string; kod: string; imya: string; cel: string; huk: string; pochemu: string }[] = []
  for (let i = 0; i < n; i++) {
    const tema = TEMY[i % TEMY.length]
    const scena = scenaDlya(tema, null)
    const u = { fakty: false, scena: !!scena, tema }
    const rang = FORMATY.filter(f => dostupen(f, u)).map(f => f.kod).sort((a, b) => hash(tema + a) - hash(tema + b)).slice(0, 6)
    const v = vybratFormat(rang, ist, i, u)
    ist.unshift({ kod: v.kod, cel: v.cel, huk: v.huk })
    out.push({ i: i + 1, tema, kod: v.kod, imya: formatPo(v.kod)!.imya, cel: CELI[v.cel], huk: HUKI_IMYA[v.huk], pochemu: v.pochemu })
  }
  return out
}

if (require.main === module) {
  const r = progonSmesi(20)
  for (const x of r) console.log(`${String(x.i).padStart(2)}. ${x.cel.padEnd(10)} ${x.imya.padEnd(40)} хук: ${x.huk.padEnd(16)} тема: ${x.tema} (${x.pochemu})`)
  for (let b = 0; b < 4; b++) {
    const blok = r.slice(b * 5, b * 5 + 5)
    console.log(`пятерка ${b + 1}: ${Object.entries(CELI).map(([k, v]) => `${v} ${blok.filter(x => x.cel === v).length}/${KVOTA[k as keyof typeof KVOTA]}`).join(', ')}`)
  }
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(r, null, 1))
}
