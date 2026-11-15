// Сколько приглашений на консультацию бывает в плане тем zh6 на 30 дней. Без сети: npx tsx scripts/test-priglasheniya.ts
// План собирается тремя пачками по 10 дней (app/api/generate-content-plan, ZH6_BATCH), zapisPravila работает на каждую пачку отдельно:
// max = floor(10 / 7) = 1 приглашение на пачку, значит до трех на месяц. Ответ на лендинге («до трех») держится на этом.
import assert from 'node:assert/strict'
import { zapisPravila, ZH6_BATCH } from '../lib/generation/zh6/write'

const pachka = (bol: boolean) => Array.from({ length: ZH6_BATCH }, (_, i) => ({ zadacha: 'zapis', reakciya: '', tema: bol ? `Страх сказать маме нет ${i}` : `Утро и кофе ${i}`, situaciya: '' }))
const count = (t: { zadacha: string }[]) => t.filter(x => x.zadacha === 'zapis').length

// худший случай: модель предложила «запись» на все 10 тем, и все темы больные
const odna = count(zapisPravila(pachka(true)))
assert.equal(odna, 1, `в пачке из ${ZH6_BATCH} тем должно остаться одно приглашение, осталось ${odna}`)
// месяц: три пачки
const mesyac = Array.from({ length: Math.ceil(30 / ZH6_BATCH) }).reduce<number>(s => s + count(zapisPravila(pachka(true))), 0)
assert.ok(mesyac <= 3, `в плане на 30 дней приглашений ${mesyac}, а на сайте обещано до трех`)
// не больная тема приглашением не становится
assert.equal(count(zapisPravila(pachka(false))), 0)
// два подряд не бывает
const r = zapisPravila(Array.from({ length: 20 }, (_, i) => ({ zadacha: 'zapis', reakciya: '', tema: `Тревога ${i}`, situaciya: '' })))
assert.ok(!r.some((x, i) => i > 0 && x.zadacha === 'zapis' && r[i - 1].zadacha === 'zapis'), 'два приглашения подряд')
console.log(`ok: приглашений в пачке из 10 тем не больше 1, в плане на 30 дней не больше ${mesyac}; только больные темы; не подряд`)
