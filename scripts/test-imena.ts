// Тест обезличивания со службой имен (26.11.2026): метки с родом, обратная подстановка, границы слов,
// запасной путь без службы, отдельный сигнал бота. Без сети и без базы: npx tsx scripts/test-imena.ts
import assert from 'node:assert/strict'
import http from 'node:http'
import { anonymize, deanonymize } from '../lib/anonymize'
import { imenaNer, _resetImenaForTest, _lastSignalForTest } from '../lib/imena-ner'
import { evaluateSignals } from '../lib/bot/report'

;(async () => {
  // 1. метки с родом и обратная подстановка
  const t = 'Вчера Снежана сказала, что Ярик опять не пришел. Снежана плакала.'
  const a = anonymize(t, { ner: [{ t: 'Снежана', g: 'f' }, { t: 'Ярик', g: 'm' }] })
  assert.ok(!/Снежана|Ярик/.test(a.masked), 'имена закрыты')
  assert.match(a.masked, /\[ИМЯ-Ж-1\][\s\S]*\[ИМЯ-Ж-1\]/, 'одно имя одна метка, с родом')
  assert.match(a.masked, /\[ИМЯ-М-1\]/)
  assert.equal(deanonymize(a.masked, a.map), t, 'обратно тот же текст')

  // 2. род не известен: обычная метка
  const b = anonymize('Сашка снова попал в больницу.', { ner: [{ t: 'Сашка', g: '' }] })
  assert.match(b.masked, /^\[ИМЯ-\d+\] снова/)

  // 3. только целое слово: «Лена» не режет «Леной» и «Ленина»
  // «Ленина» дальше закрывают старые правила как фамилию, это не наш слой: проверяем только начало
  const c = anonymize('у меня Лена, Леной звали кошку, проспект Ленина.', { ner: [{ t: 'Лена', g: 'f' }] })
  assert.ok(c.masked.startsWith('у меня [ИМЯ-Ж-1], Леной звали кошку'), c.masked)
  // дефис: «Анна-Мария» не режется пополам
  assert.equal(anonymize('Анна-Мария пришла.', { ner: [{ t: 'Мария', g: 'f' }] }).masked.includes('Анна-['), false)

  // 3а. со службой закрыто не меньше, чем без нее: фамилия и отчество за именем (блокер ревью 26.11)
  const words = (s: string) => s.match(/[А-ЯЁ][а-яё]+/g) || []
  for (const [txt, ner] of [
    ['Сегодня пришла Анна Кулькина.', [{ t: 'Анна', g: 'f' }]],
    ['Моя клиентка Анна Кулькина плакала.', [{ t: 'Анна', g: 'f' }]],
    ['Говорила с Анной Петровной Кулькиной.', [{ t: 'Анной', g: 'f' }]],
    ['Пришла Мария Сквозняк.', [{ t: 'Мария', g: 'f' }]],
  ] as [string, any][]) {
    const bez = anonymize(txt).masked, s = anonymize(txt, { ner }).masked
    for (const w of words(txt)) if (!bez.includes(w)) assert.ok(!s.includes(w), `${txt}: со службой открылось «${w}»`)
    assert.ok(!/Кулькин|Петровн|Сквозняк/.test(s), `${txt}: фамилия закрыта -> ${s}`)
    assert.equal(deanonymize(s, anonymize(txt, { ner }).map), txt)
  }

  // 4. мусор от службы не проходит: не имя по виду слова
  const d = anonymize('у нас [ИМЯ-1] и снег', { ner: [{ t: '[ИМЯ-1]', g: '' } as any, { t: 'снег', g: '' }, { t: '', g: '' }] })
  assert.equal(d.masked, 'у нас [ИМЯ-1] и снег')

  // 5. имя психолога остается обычной меткой [ИМЯ-n] (на нее завязан simple.ts)
  const e = anonymize('Я Ольга, ко мне пришла Снежана.', { extraNames: ['Ольга'], ner: [{ t: 'Ольга', g: 'f' }, { t: 'Снежана', g: 'f' }] })
  assert.match(e.masked, /^Я \[ИМЯ-1\], ко мне пришла \[ИМЯ-Ж-1\]\.$/)

  // 6. без службы все как раньше
  const plain = 'Клиентка Снежана пришла, позвоните +7 999 123-45-67.'
  assert.deepEqual(anonymize(plain), anonymize(plain, { ner: [] }))

  // 7. клиент службы: без адреса не зовется
  delete process.env.IMENA_SERVICE_URL
  assert.equal(await imenaNer('Снежана'), null)

  // 8. клиент службы: ответ, ошибка, тайм-аут
  let mode: 'ok' | '500' | 'slow' | 'busy1' | 'busy' = 'ok'
  let busyLeft = 0
  const srv = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer test') { res.statusCode = 401; return res.end() }
    if (mode === '500') { res.statusCode = 500; return res.end() }
    if (mode === 'busy' || (mode === 'busy1' && busyLeft-- > 0)) { res.statusCode = 503; return res.end() }
    if (mode === 'slow') return setTimeout(() => res.end('{"imena":[]}'), 3000)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ imena: [{ t: 'Снежана', g: 'f' }, { t: 'Ярик', g: 'x' }, { bad: 1 }] }))
  })
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()))
  const port = (srv.address() as any).port
  process.env.IMENA_SERVICE_URL = `http://127.0.0.1:${port}`
  process.env.IMENA_SERVICE_TOKEN = 'test'
  assert.deepEqual(await imenaNer('Снежана и Ярик'), [{ t: 'Снежана', g: 'f' }, { t: 'Ярик', g: '' }])
  mode = '500'; assert.equal(await imenaNer('Снежана'), null)
  // после сбоя минуту не зовем: ответ сразу, даже если служба уже жива
  mode = 'ok'; let t1 = Date.now(); assert.equal(await imenaNer('Снежана'), null); assert.ok(Date.now() - t1 < 100, 'пауза после сбоя')
  _resetImenaForTest()
  mode = 'slow'; const t0 = Date.now(); assert.equal(await imenaNer('Снежана'), null); assert.ok(Date.now() - t0 < 2800, 'тайм-аут 2 с')
  // длинный текст службе не шлем
  _resetImenaForTest(); mode = 'ok'; assert.equal(await imenaNer('а'.repeat(40001)), null)

  // занята один раз: повтор в том же бюджете дает ответ
  _resetImenaForTest(); mode = 'busy1'; busyLeft = 1
  assert.deepEqual(await imenaNer('Снежана'), [{ t: 'Снежана', g: 'f' }, { t: 'Ярик', g: '' }])
  // занята все время: null не дольше бюджета, служба после этого не на паузе
  _resetImenaForTest(); mode = 'busy'; let t2 = Date.now(); assert.equal(await imenaNer('Снежана'), null); assert.ok(Date.now() - t2 < 2200, 'busy в бюджете')
  mode = 'ok'; assert.ok(Array.isArray(await imenaNer('Снежана')), 'после busy служба не на паузе')

  // сигнал только после трех сбоев подряд: время двигаем вперед, чтобы пройти паузу 60 с после каждого сбоя
  _resetImenaForTest(); mode = '500'
  const realNow = Date.now; let shift = 0; Date.now = () => realNow() + shift
  for (let k = 1; k <= 3; k++) {
    shift += 61000
    assert.equal(await imenaNer('x'), null)
    if (k < 3) assert.equal(_lastSignalForTest(), 0, `сбой ${k}: сигнала еще нет`)
    else assert.ok(_lastSignalForTest() > 0, 'третий сбой подряд: сигнал')
  }
  Date.now = realNow
  srv.close()

  // 9. бот: сбой службы имен дает свой сигнал и не считается сбоем генерации
  const sig = evaluateSignals({ streak: 9, genHour: 0, fresh: [{ kind: 'gen', code: 'anon_ner_down', created_at: new Date().toISOString() }] as any })
  assert.deepEqual(sig.map(s => s.key), ['anon_ner'])
  const sig2 = evaluateSignals({ streak: 9, genHour: 0, fresh: [{ kind: 'gen', code: 'server', created_at: new Date().toISOString() }] as any })
  assert.ok(sig2.some(s => s.key === 'gen_streak'))

  console.log('test-imena: все проверки прошли')
})().catch(e => { console.error(e); process.exit(1) })
