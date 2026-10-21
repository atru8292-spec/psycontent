// Слить прогоны eval в одну папку (22.10): догенерация после обрыва (ошибки 429, таймауты) заменяет упавшие тексты.
// Бесплатно. Тексты без ошибки из последующих прогонов заменяют записи с тем же id.
//   npx tsx scripts/merge-runs.ts --into=<папка> --from=<папка>[,<папка>]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const flag = (n: string) => (argv.find(a => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')
const E = join(__dirname, '..', '_знания', 'мозг-генератора', 'test', 'eval')
const into = join(E, flag('into'), 'results.json')
if (!existsSync(into)) throw new Error(`нет ${into}`)
const base: any[] = JSON.parse(readFileSync(into, 'utf8'))
let n = 0
for (const dir of flag('from').split(',').filter(Boolean)) {
  for (const r of JSON.parse(readFileSync(join(E, dir, 'results.json'), 'utf8'))) {
    if (r.error || !r.text) continue
    const i = base.findIndex(x => x.id === r.id)
    if (i >= 0) base[i] = { ...r, rerun: dir }; else base.push({ ...r, rerun: dir })
    n++
  }
}
writeFileSync(into, JSON.stringify(base, null, 2))
console.log(`Слито ${n}, в ${flag('into')} теперь ${base.filter(x => !x.error).length} без ошибок из ${base.length}`)
