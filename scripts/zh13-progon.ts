// zh13: живой прогон генератора прода (lib/generation/zh13/pishi.ts) на 6 текстах без базы: рилсы трех форматов,
// текст из своей мысли, карусель, пост. База заменена заглушкой (истории нет, ничего не пишется), профиль из файла
// или тестовый. Без --yes только промпты и оценка, без вызовов модели. Результат: _знания/мозг-генератора/zh13-prod/.
//   npx tsx --env-file=$HOME/Downloads/psycontent/.env.local scripts/zh13-progon.ts [--profil=файл.json] --yes
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { napisat } from '../lib/generation/zh13/pishi'

const argv = process.argv.slice(2)
const flag = (n: string) => (argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')
const DIR = join(process.cwd(), '_знания', 'мозг-генератора', 'zh13-prod')

const PROFIL = flag('profil') ? JSON.parse(readFileSync(flag('profil'), 'utf8')) : {
  full_name: 'Тест', author_gender: 'female', reader_address: 'ty', profanity: 'no', approaches: ['КПТ', 'Гештальт'],
  niches: ['Тревога и накручивание', 'Ревность', 'Вина после «нет»', 'Выгорание'],
  klienty: { groups: ['trevoga', 'otnosheniya', 'rabota'], age: ['25-45'], gender: 'Все', format: ['Онлайн'] },
  tone_verbal: 'Слушай, давай без паники. С тобой все нормально, просто сил нет, и от этого страшно. Это лечится.',
  client_pain_phrases: 'Я опять накручиваю\nНе могу сказать нет',
}
const ZADANIYA: { kod: string; mysl?: string }[] = [
  { kod: 'sessiya' }, { kod: 'perevod' }, { kod: 'ekran' },
  { kod: 'mysl', mysl: 'Тревога не враг. Она сторож, который слишком старается и лает на каждый шорох' },
  { kod: 'k_priznaki' }, { kod: 'p_paradoks' },
]

// заглушка базы: истории текстов нет, запросы возвращают пусто
function stubDb(n: { i: number }): any {
  const q: any = {
    select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (ok: any) => ok({ data: [], count: n.i, error: null }),
  }
  return { from: () => q }
}

async function main() {
  mkdirSync(DIR, { recursive: true })
  if (!argv.includes('--yes')) {
    console.log(`Без --yes ничего не вызываю. Будет ${ZADANIYA.length} вызовов gpt-6.1-sol, по опыту zh13 около 1 ₽ за текст.`)
    return
  }
  if (!process.env.OPENAI_API_KEY) throw new Error('нужен ключ (--env-file)')
  process.env.USAGE_LOG_FILE = join(DIR, 'usage.jsonl')
  const out: any[] = []
  for (let i = 0; i < ZADANIYA.length; i++) {
    const z = ZADANIYA[i]
    const t0 = Date.now()
    try {
      const it = await napisat(stubDb({ i }), 'progon', PROFIL, { formatKod: z.kod, mysl: z.mysl || null, tema: null, fromPostId: null }, [], { bezUcheta: true })
      out.push({ kod: z.kod, imya: it.f.imya, ms: Date.now() - t0, meta: it.meta, problemy: it.proverka.problemy, blizost: it.proverka.blizost, syroe: it.syroe })
      console.log(`${z.kod}: ${Math.round((Date.now() - t0) / 1000)} с, проблемы: ${it.proverka.problemy.join(', ') || 'нет'}`)
    } catch (e: any) {
      console.log(`${z.kod}: ошибка ${String(e?.message || e).slice(0, 120)}`)
      if (/credit_balance|insufficient_quota|openai_401/i.test(String(e?.message || e))) break
    }
    writeFileSync(join(DIR, 'rezultaty.json'), JSON.stringify(out, null, 1))
  }
  const md = out.map(x => [`## ${x.imya} (${x.kod}), ${Math.round(x.ms / 1000)} с`, x.meta.mysl ? `Мысль: ${x.meta.mysl}` : `Тема: ${x.meta.tema}`, `Ситуация: ${x.meta.situaciya || 'нет'}`, `Опора: ${x.meta.opora}`, `Проблемы кодом: ${x.problemy.join(', ') || 'нет'}; ритм ${x.blizost}`, '', '```', x.syroe, '```', ''].join('\n')).join('\n')
  writeFileSync(join(DIR, 'TEKSTY.md'), `# zh13 в проде: живой прогон\n\n${md}`)
  console.log(`готово: ${out.length} текстов, ${join(DIR, 'TEKSTY.md')}`)
}
main().catch(e => { console.error('ошибка:', String(e?.message || e).slice(0, 300)); process.exit(1) })
