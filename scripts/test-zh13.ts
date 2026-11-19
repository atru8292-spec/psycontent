// zh13 без модели и без базы: форматы, опоры, образцы, промпт, разбор ответа, проверка качества, флаг, тревога.
//   npx tsx scripts/test-zh13.ts [путь к rezultaty-zh13.json опыта]   (с файлом: разбор и проверка на сохраненных текстах)
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { FORMATY, formatPo, vybratAuto, KRUG_AUTO } from '../lib/generation/zh13/formaty'
import { OPORY, oporyPsihologa, vybratOporu } from '../lib/generation/zh13/opory'
import { prompt13 } from '../lib/generation/zh13/prompt'
import { razobrat } from '../lib/generation/zh13/razbor'
import { proverit, povtoryOborotov, podpisMoral, podpisVopros } from '../lib/generation/zh13/proverka'
import { podobrat, avtorIz } from '../lib/generation/zh13/pishi'
import { zh13Dlya } from '../lib/generation/zh13/flag'
import { vysheePoroga } from '../lib/generation/zh13/kachestvo-db'
import { situaciiTemy } from '../lib/anketa'
import { pometit, rubrikaVoprosov } from '../lib/generation/zh13/pometki'
import { TEKSTY_PRAVOK, paryDlya, gruppaPar } from '../lib/generation/zh13/pravki'
import { progonSmesi } from './zh13-smes'
import { dostupen, tyazhelayaTema } from '../lib/generation/zh13/smes'
import { scenaDlya, scenaBlok, SCENY, svestiRepliki, replikiTochno, strokaRepliki } from '../lib/generation/zh13/sceny'
import { pometitObrashcheniya } from '../lib/generation/zh13/pometki'
import { podpisPerevertysh, povtorSoveta, moralKonca } from '../lib/generation/zh13/proverka'

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name) }

ok('26 форматов (карусель одна, на zh6), у каждого цель и хук, коды разные, у каждого zh13 есть 2-3 образца', () => {
  assert.equal(FORMATY.length, 26)
  assert.equal(new Set(FORMATY.map(f => f.kod)).size, 26)
  for (const f of FORMATY) { assert.ok(['uznavanie', 'polza', 'spor', 'doverie'].includes(f.cel), f.kod); assert.ok(f.huki.length, f.kod) }
  for (const k of ['pov_assoc', 'pov_scenka', 'golos', 'vrednye', 'sebe20', 'slyshit', 'dve_zhizni', 'film_bez', 'film_lico', 'spor', 'pravila', 'istoriya']) assert.ok(formatPo(k), k)
  assert.deepEqual(FORMATY.filter(f => f.vid === 'carousel').map(f => [f.kod, f.zh6]), [['karusel', true]])
  assert.equal(FORMATY[0].kod, 'mysl')
  for (const f of FORMATY.filter(f => !f.zh6)) {
    const o = podobrat(f, 'Тревога и накручивание', situaciiTemy('Тревога и накручивание'), false, 1, new Set())
    assert.ok(o.length >= 2, `${f.kod}: образцов ${o.length}`)
    if (['pov_assoc', 'golos', 'vrednye', 'spor', 'pravila'].includes(f.kod)) assert.ok(o.some(x => x.id.startsWith('insta:')), `${f.kod}: нет находок insta`)
    if (f.vid === 'post') assert.ok(!o.some(x => x.format === 'carousel'), `${f.kod}: у поста образец-карусель`)
    assert.ok(!o.some(x => x.mat), `${f.kod}: мат без разрешения`)
  }
  for (const k of KRUG_AUTO) assert.ok(formatPo(k), k)
})

ok('«Подбери сам» по кругу, два последних формата пропускаются', () => {
  assert.equal(vybratAuto(0, []), 'mysl')
  assert.notEqual(vybratAuto(0, ['mysl']), 'mysl')
  const k = vybratAuto(1, ['sessiya', 'karusel'])
  assert.ok(!['sessiya', 'karusel'].includes(k))
})

ok('опоры: у всех 12 подходов по 10, без рода, подряд не повторяются', () => {
  assert.equal(Object.keys(OPORY).length, 12)
  for (const [k, v] of Object.entries(OPORY)) {
    assert.equal(v.length, 10, k)
    for (const o of v) assert.ok(!/(?<!\p{L})(должна|никчемная|успела|сама|устала)(?!\p{L})/iu.test(o), `${k}: ${o}`)
  }
  const o = oporyPsihologa(['КПТ', 'Гештальт'])
  assert.equal(o.length, 20)
  assert.equal(o[0], OPORY['КПТ'][0]); assert.equal(o[1], OPORY['Гештальт'][0])
  assert.equal(oporyPsihologa([])[0], OPORY['Интегративный'][0])
  let prev: string[] = []
  for (let i = 0; i < 30; i++) { const x = vybratOporu(o, i, prev); assert.ok(!prev.slice(0, 3).includes(x)); prev = [x, ...prev] }
})

const profil = { author_gender: 'female', reader_address: 'ty', profanity: 'no', approaches: ['КПТ'], niches: ['Тревога и накручивание'],
  klienty: { groups: ['trevoga'], age: ['25-45'], gender: 'Все', format: ['Индивидуально'] }, tone_verbal: 'Слушай, давай разберемся спокойно' }

ok('промпт: образцы, опора, ритм своего формата, без названия подхода, род читателя, «Подойдет еще»', () => {
  const a = avtorIz(profil)
  assert.equal(a.vy, false); assert.equal(a.mat, 'net'); assert.deepEqual(a.gruppy, ['Тревога и стресс'])
  for (const f of FORMATY.filter(f => !f.zh6)) {
    const obr = podobrat(f, 'Тревога и накручивание', [], false, 0, new Set())
    const p = prompt13(a, { f, tema: 'Тревога и накручивание', mysl: null, situaciya: 'партнер не отвечает час, а в голове уже авария', opora: OPORY['КПТ'][0], huk: 'Первая фраза: вопрос.', obrazcy: obr, kusok: 'кусок' })
    assert.ok(!/КПТ(?!СР)|когнитив/i.test(p.user), 'название подхода в промпте')
    assert.ok(p.user.includes('<живой кусок>'))
    assert.ok(p.user.includes('без рода'))
    assert.ok(p.user.includes('Подойдет еще:'))
    assert.equal(p.user.includes('Как снять:'), f.vid === 'reels', f.kod)
    assert.equal(p.user.includes('Не заканчивай текст вопросом'), f.kod !== 'voprosy', f.kod)
    assert.ok(!p.user.includes('{huk}'))
    // рилсы R1: без «как сказал бы вслух»; понятность: одна строка и 3-4 пары под формат
    assert.ok(!p.user.includes('как сказал бы вслух'), f.kod)
    assert.ok(p.user.includes('Пиши так, чтобы зритель понял каждую фразу с первого раза'))
    const par = (p.user.match(/^Было: «/gm) || []).length
    assert.ok(par >= 3 && par <= 4, `${f.kod}: пар ${par}`)
    assert.ok(!p.user.includes('Светину дочку'), 'пример вопросов маме в промпте')
    if (f.vid === 'post') assert.ok(!p.user.includes('Так звучат живые подписи'))
  }
  const z = { ...profil, klienty: { ...profil.klienty, gender: 'В основном женщины' } }
  const p2 = prompt13(avtorIz(z), { f: FORMATY[0], tema: 'Т', mysl: null, situaciya: null, opora: 'о', huk: '', obrazcy: [], kusok: 'к' })
  assert.ok(!p2.user.includes('без рода'))
})

ok('своя мысль: текст из мысли, смысл не меняется, ситуация и опора только если подходят', () => {
  const p = prompt13(avtorIz(profil), { f: FORMATY[0], tema: null, mysl: 'Тревога не враг, она сторож', situaciya: 'ситуация', opora: 'опора', huk: 'х', obrazcy: [], kusok: 'к' })
  assert.ok(p.user.includes('Мысль автора, его словами: «Тревога не враг, она сторож»'))
  assert.ok(p.user.includes('не меняй его и не дописывай своих выводов'))
  assert.ok(p.user.includes('можно от нее оттолкнуться; не подходит, не бери'))
  assert.ok(p.user.includes('опора (бери это, только если подходит к мысли)'))
  assert.ok(!p.user.includes('Тема:'))
})

ok('разбор: речь без меток, подпись, надпись, «Как снять», «Подойдет еще» с проверкой кодов', () => {
  const f = formatPo('sessiya')!
  const raw = 'В кадре: экран на два окна\nТекст на экране: «Он не ответил час»\nРечь:\nПсихолог: Что вы подумали?\nКлиентка: Что он разбился.\nПодпись: Час тишины, и в голове уже похороны.\n\nКак снять:\n- Поставь телефон на уровне глаз\n- Сними часть, где ты спрашиваешь\n- В CapCut раздели экран\n\nПодойдет еще:\n- mysl: тут одна ясная мысль\n- sessiya: тот же\n- neznayu: такого нет\n- perevod: есть фраза, которую говорят\n- karusel: признаки узнаются'
  const r = razobrat(raw, f)
  assert.equal(r.glavnoe, 'Психолог: Что вы подумали?\nКлиентка: Что он разбился.')
  assert.equal(r.podpis, 'Час тишины, и в голове уже похороны.')
  assert.equal(r.nadpis, '«Он не ответил час»')
  assert.deepEqual(r.kakSnyat, ['Поставь телефон на уровне глаз', 'Сними часть, где ты спрашиваешь', 'В CapCut раздели экран'])
  assert.deepEqual(r.podoydet.map(x => x.kod), ['mysl', 'perevod', 'karusel'])
  assert.ok(!r.tekst.includes('Как снять') && !r.tekst.includes('Подойдет'))
  assert.ok(r.tekst.includes('Подпись:'))
  // модель не дала блоков: запасные шаги и тройка
  const r2 = razobrat('Речь: Просто текст.\nПодпись: П.', formatPo('mysl')!)
  assert.ok(r2.kakSnyat.length >= 2 && !r2.kakSnyatOtModeli)
  assert.equal(r2.podoydet.length, 3); assert.ok(!r2.podoydet.some(x => x.kod === 'mysl'))
  // текст на экране: главное это надписи по кадрам
  const r3 = razobrat('В кадре: стол\nТекст на экране:\nКадр 1: Раз\nКадр 2: Два\nРечь: нет\nПодпись: П.', formatPo('ekran')!)
  assert.equal(r3.glavnoe, 'Кадр 1: Раз\nКадр 2: Два')
  // карусель
  const r4 = razobrat('Слайд 1: А\nСлайд 2: Б\nПодпись: В.\n\nПодойдет еще:\n- mysl: м', formatPo('karusel')!)
  assert.equal(r4.glavnoe, 'Слайд 1: А\nСлайд 2: Б'); assert.equal(r4.podpis, 'В.'); assert.equal(r4.kakSnyat.length, 0)
})

ok('проверка: мораль, вопрос, «Подожди», шаблон подписи, род, копия, опора, ё и тире', () => {
  const f = formatPo('mysl')!
  const base = { f, obrazcy: ['совсем другой текст про другое и без совпадений никаких вообще'], kusok: 'к', opora: 'о', poslednyayaOpora: 'о', auditoriyaZhenshiny: false }
  const t = 'Речь: Подожди, ты опять сама все сделала? Это нормально. Можно всегда быть собой.\nПодпись: Можно любить маму и злиться.'
  const r = razobrat(t, f)
  const p = proverit({ ...base, syroe: t + ' — ё', tekst: r.tekst, glavnoe: r.glavnoe, podpis: r.podpis })
  for (const k of ['moral', 'podozhdi', 'podpis_shablon', 'rod', 'opora_povtor']) assert.ok(p.problemy.includes(k), k)
  // «ё» и тире в сыром ответе чистит код: проблема, только если они дошли до текста
  assert.ok(!p.problemy.includes('yo') && !p.problemy.includes('tire'))
  const p2 = proverit({ ...base, syroe: t, tekst: r.tekst + ' ещё — так', glavnoe: r.glavnoe, podpis: r.podpis })
  assert.ok(p2.problemy.includes('yo') && p2.problemy.includes('tire'))
  assert.equal(p.podpisNachalo, 'можно любить'); assert.equal(p.pervyeSlova, 'подожди ты')
  const t2 = 'Речь: Обычный текст без вопроса.\nПодпись: А вы так делаете?'
  const r2 = razobrat(t2, f)
  assert.ok(proverit({ ...base, poslednyayaOpora: null, syroe: t2, tekst: r2.tekst, glavnoe: r2.glavnoe, podpis: r2.podpis }).problemy.includes('vopros_konec'))
  const obr = 'раз два три четыре пять шесть семь восемь'
  const t3 = `Речь: ну раз два три четыре пять шесть и все.\nПодпись: П.`
  const r3 = razobrat(t3, f)
  assert.ok(proverit({ ...base, obrazcy: [obr], poslednyayaOpora: null, syroe: t3, tekst: r3.tekst, glavnoe: r3.glavnoe, podpis: r3.podpis }).problemy.includes('kopiya'))
})

ok('пометки только явного: анкета героя, суд, «Перевожу», обрывки, тело, адресат вопросов', () => {
  const k = (t: string, kod = 'mysl', nad = '') => pometit(t, kod, nad).map(x => x.kod)
  assert.deepEqual(k('Ему сорок с лишним, у него машина, ипотека и дети. Но за столом все хорошо.'), ['anketa_geroya'])
  assert.deepEqual(k('Ты уже провел суд и запретил себе работать.'), ['sud_dokumenty'])
  assert.deepEqual(k('Начальник попросил доклад к пятнице, а ты молчишь.'), [])
  assert.deepEqual(k('Ты пишешь маме. В ответ прилетает целая переписка. Перевожу.'), ['perevozhu', 'perevozhu'])
  assert.deepEqual(k('Не разбивать. Не спорить. Не попадаться под руку. Так и жила.'), ['obryvki'])
  assert.deepEqual(k('Он смеется, а под столом сжаты кулаки.'), ['telo'])
  assert.deepEqual(k('1. Почему ты завидуешь?', 'voprosy', '«Задаю неудобные вопросы зависти за вас»'), ['adresat'])
  assert.deepEqual(k('1. Почему ты сравниваешь?', 'voprosy', '«Задаю неудобные вопросы маме, которая сравнивает, за вас»'), [])
  // живое не метим: мат, метафора, обрывок
  assert.deepEqual(k('Да блин. Ну вот опять. Тревога как сторож, лает на все подряд.'), [])
  assert.equal(rubrikaVoprosov('Задаю неудобные вопросы непрошеному советчику за вас'), 'непрошеному советчику')
})

ok('копирование примеров из правок Арины ловится', () => {
  const f = formatPo('mysl')!
  const t = 'Речь: Переспросили, полегчало. Через час опять тревожно, и опять переспрашиваете. Так по кругу.\nПодпись: П.'
  const r = razobrat(t, f)
  const p = proverit({ f, syroe: t, tekst: r.tekst, glavnoe: r.glavnoe, podpis: r.podpis, obrazcy: [], kusok: '', opora: 'о', poslednyayaOpora: null, auditoriyaZhenshiny: true })
  assert.ok(p.problemy.includes('kopiya'))
  assert.ok(TEKSTY_PRAVOK.length > 20)
})

ok('пары «было / живо»: случайно из пула своего формата, 3-4, не одни и те же', () => {
  for (const [kod, vid] of [['sessiya', 'reels'], ['perevod', 'reels'], ['mysl', 'reels'], ['voprosy', 'reels'], ['p_paradoks', 'post']]) {
    const nabory = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const pp = paryDlya(kod, vid, i)
      assert.ok(pp.length >= 3 && pp.length <= 4)
      nabory.add(pp.map(x => x.zhivo).sort().join('|'))
    }
    assert.ok(nabory.size >= 8, `${kod}: разных наборов ${nabory.size}`)
  }
  assert.equal(gruppaPar('scenka', 'reels'), 'dialog'); assert.equal(gruppaPar('ekran', 'reels'), 'monolog')
})

ok('неудобные вопросы: меньше трех разных начал помечается', () => {
  const f = formatPo('voprosy')!
  const odno = 'Речь:\n1. Почему ты молчишь?\n2. Почему ты кричишь?\n3. Почему ты злишься?\n4. Почему ты уходишь?\n5. Почему ты врешь?\nПодпись: П.'
  const r = razobrat(odno, f)
  const pr = (t: string) => { const x = razobrat(t, f); return proverit({ f, syroe: t, tekst: x.tekst, glavnoe: x.glavnoe, podpis: x.podpis, obrazcy: [], kusok: '', opora: 'о', poslednyayaOpora: null, auditoriyaZhenshiny: true }).problemy }
  assert.ok(pr(odno).includes('voprosy_odinakovye')); void r
  const raznye = 'Речь:\n1. Почему ты молчишь?\n2. Ты правда думаешь, что так лучше?\n3. Если бы я так делал, тебе было бы приятно?\n4. Когда я прошу, ты слышишь?\n5. Почему ты уходишь?\nПодпись: П.'
  assert.ok(!pr(raznye).includes('voprosy_odinakovye'))
})

ok('повтор оборотов 4+ слов между текстами психолога, служебные цепочки не в счет', () => {
  assert.deepEqual(povtoryOborotov('А что, по-вашему, случится, если вы откажете маме?', ['Подумайте, что по-вашему случится если вы промолчите.']), ['что по-вашему случится если вы'])
  assert.deepEqual(povtoryOborotov('и я не на это', ['и я не на это']), [])
})

ok('суд и бумаги: про чувства метим, настоящую работу и «вынести приговор» нет', () => {
  const k = (t: string) => pometit(t, 'mysl').map(x => x.kod)
  for (const t of ['Одобрение получить проще, только тебя в этой презентации почти нет.', 'Без обвинений и получасовой защиты своего желудка в суде.', 'Для внутреннего суда доказательства не нужны.',
    'Даже когда мама об этом согласовании не знает.', 'Партнер уже оглашает встречный иск.', 'Ты спорила с бывшим час. Хоть презентация, блин.'])
    assert.deepEqual(k(t), ['sud_dokumenty'], t)
  for (const t of ['Ты уже выносишь мне приговор.', 'Завтра презентация для начальника, и ты не спишь.', 'Коллеги ждут доклад. Ты третий день его переписываешь.', 'Юрист сказал, что иск примут.'])
    assert.deepEqual(k(t), [], t)
  assert.deepEqual(k('Он сжимает кулак под столом.'), ['telo'])
  assert.deepEqual(pometit('1. Почему ты?', 'voprosy', 'Задаю неудобные вопросы страху быть неудобной за вас').map(x => x.kod), ['adresat'])
})

ok('мораль: своя мысль в конце не мораль, подпись с моралью и вопросом находится', () => {
  const f = formatPo('mysl')!
  const t = 'Речь: Бывает страшно без повода. Так что тревога не враг. Она сторож, который слишком старается и лает на каждый шорох.\nПодпись: Пакет у забора.'
  const r = razobrat(t, f)
  const base = { f, syroe: t, tekst: r.tekst, glavnoe: r.glavnoe, podpis: r.podpis, obrazcy: [], kusok: '', opora: 'о', poslednyayaOpora: null, auditoriyaZhenshiny: true }
  assert.ok(!proverit({ ...base, mysl: 'Тревога не враг. Она сторож, который слишком старается и лает на каждый шорох' }).problemy.includes('moral'))
  assert.ok(podpisMoral('Можно любить маму и злиться. Это нормально.'))
  assert.ok(!podpisMoral('Пакет у забора. В доме никто не спит.'))
  assert.ok(podpisVopros('Ты так переживаешь с любым человеком или именно с ним?'))
})

ok('смесь: 20 подборов, пятерки 2/1/1/1, формат и хук не подряд, спор не подряд и не на тяжелой теме', () => {
  const r = progonSmesi(20)
  for (let i = 1; i < r.length; i++) {
    assert.notEqual(r[i].kod, r[i - 1].kod, `формат подряд ${i}`)
    if (r[i].huk !== 'нет') assert.notEqual(r[i].huk, r[i - 1].huk, `хук подряд ${i}`)
    assert.ok(!(r[i].cel === 'спор' && r[i - 1].cel === 'спор'), `спор подряд ${i}`)
  }
  assert.ok(!r.some(x => x.cel === 'спор' && tyazhelayaTema(x.tema)))
  for (let b = 1; b < 4; b++) {
    const blok = r.slice(b * 5, b * 5 + 5).map(x => x.cel)
    assert.deepEqual([blok.filter(c => c === 'узнавание').length, blok.filter(c => c === 'польза').length, blok.filter(c => c === 'спор').length, blok.filter(c => c === 'доверие').length], [2, 1, 1, 1], `пятерка ${b + 1}`)
  }
})

ok('факты и сцены: формат на фактах без мысли и фильм без сцены недоступны; сцены только проверенные', () => {
  assert.ok(!dostupen(formatPo('sebe20')!, { fakty: false, scena: true, tema: '' }))
  assert.ok(dostupen(formatPo('sebe20')!, { fakty: true, scena: false, tema: '' }))
  assert.ok(!dostupen(formatPo('film_bez')!, { fakty: true, scena: false, tema: '' }))
  assert.equal(scenaDlya('Мамы и взрослые дочери', null)?.film, 'Леди Берд')
  assert.equal(scenaDlya('Юмор про терапию', null), null)
  const ss = scenaDlya('Злость', null)!
  assert.equal(ss.vid, 'сериал'); assert.equal(ss.sezon, 7); assert.equal(ss.seriya, 10); assert.ok(ss.proverena)
  assert.ok(!/рескрипт/i.test(scenaBlok(ss)), 'название техники в промпте')
  assert.ok(SCENY.every(x => x.vid === 'фильм' || x.vid === 'сериал'))
  assert.ok(!SCENY.filter(x => !x.proverena).some(x => scenaDlya(x.temy[0], null)?.id === x.id))
})

ok('правки 19.11 после zh14: обращение, перевертыш, тело, рвано, реплики сцены, совет с числом, мораль в конце', () => {
  // 1. «Слушай,» один раз живое; два раза в тексте или подряд с прошлым текстом метится
  assert.equal(pometitObrashcheniya('Слушай, тут главное не мешать.', 'Подпись спокойная.').length, 0)
  const ob = pometitObrashcheniya('Слушай, я бы не стала. И я бы сказала: слушай, тебе нужна помощь.', '')
  assert.deepEqual(ob.map(x => x.fraza), ['И я бы сказала: слушай, тебе нужна помощь.'])
  assert.equal(pometitObrashcheniya('Слушай, я бы не стала.', '', 'Слушай, тут главное не мешать.').length, 1)
  assert.equal(pometitObrashcheniya('Знаешь, я бы не стала.', '', 'Слушай, тут главное не мешать.').length, 0)
  // 2. подпись-перевертыш
  assert.ok(podpisPerevertysh('Звонок на три минуты. Внутренний долг на всю жизнь.'))
  assert.ok(podpisPerevertysh('Диплом остается. Обязанность всю жизнь работать по нему в комплект не входит.'))
  assert.ok(!podpisPerevertysh('Чужую грубость легко принять за честную оценку. Особенно если она звучит знакомо.'))
  assert.ok(!podpisPerevertysh('Зеленая кружка понравилась сразу. Остальные двадцать минут я искала, что с ней не так.'))
  // 3. тело: живот, плечи, челюсть, дыхание; совет «сделай вдох» не тело
  for (const t of ['Второй хочет ответить, но живот сжимается.', 'Плечи уже напряжены.', 'Сжимаю челюсть и молчу.', 'Дыхание сбивается, когда он входит.'])
    assert.ok(pometit(t, 'mysl').some(x => x.kod === 'telo'), t)
  assert.ok(!pometit('Сделай медленный вдох и выдох, это помогает.', 'mysl').some(x => x.kod === 'telo'))
  // 4. рвано: 3+ фраз до 4 слов подряд; заголовок раздела и диалог нет
  assert.ok(pometit('Вот это я бы убрала. В тридцать два. Пошла учиться. Не в двадцать, да. Но пошла.', 'sebe20').some(x => x.kod === 'rvano' && x.fraza === 'В тридцать два. Пошла учиться. Не в двадцать, да. Но пошла.'))
  assert.ok(!pometit('Первая работа. Оба заполнили документ. Первый уточняет, переделывает и потом отдыхает.', 'dve_zhizni').some(x => x.kod === 'rvano'))
  assert.ok(!pometit('Клиентка: Ну, есть ли кто-то. Сердечки, сообщения. Ничего не нашла.', 'sessiya').some(x => x.kod === 'rvano'))
  // 5. реплики сцены: у каждой кто говорит; склеенные раскладываются, переписанные заменяются записью
  assert.ok(SCENY.filter(x => x.proverena).every(x => x.repliki.every(r => r.kto && r.tekst)))
  const lb = SCENY.find(x => x.id === 'ledi-berd-summa')!
  assert.ok(scenaBlok(lb).includes('Мама: «Я тебя очень люблю, дочка.»') && scenaBlok(lb).includes('Дочь: «Но нравлюсь ли я тебе?»'))
  const skleeno = '«Назови мне сумму, в которую я вам двоим обошлась.»\n«Я тебя очень люблю, дочка. Но нравлюсь ли я тебе?»'
  assert.ok(!replikiTochno(skleeno, lb))
  const sv = svestiRepliki(skleeno, lb)
  assert.equal(sv.text, ['Дочь: «Назови мне сумму, в которую я вам двоим обошлась.»', 'Мама: «Я тебя очень люблю, дочка.»', 'Дочь: «Но нравлюсь ли я тебе?»'].join('\n'))
  assert.ok(sv.ok && replikiTochno(sv.text, lb))
  assert.equal(svestiRepliki('Мама: «Я очень тебя люблю, доченька.»', lb).text, strokaRepliki(lb.repliki[2]))
  assert.equal(svestiRepliki('Мама: «Купи себе новое платье на выпускной.»', lb).text, '')
  // слова зрителя в кавычках внутри речи психолога и отдельной строкой не трогаются
  const st = SCENY.find(x => x.id === 'stazher-sobesedovanie')!
  const fl = 'Психолог: Знакомое: «Столько лет учебы коту под хвост»?\n«Поздно уже что-то менять»\nБен: «Я хочу узнать что-то новое, помочь, чем могу.»'
  assert.equal(svestiRepliki(fl, st).text, fl); assert.ok(replikiTochno(fl, st))
  // 6. совет с тем же числом подряд
  assert.deepEqual(povtorSoveta('попробуй выйти на десять минут до конца списка', 'отложить телефон на десять минут'), ['десять минут'])
  assert.deepEqual(povtorSoveta('попробуй выйти на пять минут', 'отложить телефон на десять минут'), [])
  // 7. мораль в конце: место для переписи вместе с «не в том»
  const dz = 'Попробуй начать с недорогой покупки.\n\nЗадача не в том, чтобы никогда не жалеть. А в том, чтобы сожаление можно было пережить без наказания себя.'
  assert.equal(moralKonca(formatPo('dve_zhizni')!, dz, dz, null), 'Задача не в том, чтобы никогда не жалеть. А в том, чтобы сожаление можно было пережить без наказания себя.')
  assert.equal(moralKonca(formatPo('mysl')!, 'Тревога не враг. Попросить о помощи можно всегда.', 'Тревога не враг. Попросить о помощи можно всегда.', 'попросить о помощи можно всегда'), null)
})

ok('флаг: GENERATOR=zh13 и список почт', () => {
  const save = { g: process.env.GENERATOR, l: process.env.ZH13_ONLY_EMAILS }
  delete process.env.GENERATOR; assert.equal(zh13Dlya('a@b.ru'), false)
  process.env.GENERATOR = 'zh13'; process.env.ZH13_ONLY_EMAILS = 'atru8292+*@gmail.com, x@y.ru'
  assert.equal(zh13Dlya('atru8292+test@gmail.com'), true); assert.equal(zh13Dlya('X@Y.ru'), true); assert.equal(zh13Dlya('z@y.ru'), false); assert.equal(zh13Dlya(null), false)
  process.env.ZH13_ONLY_EMAILS = ''; assert.equal(zh13Dlya('z@y.ru'), true)
  process.env.GENERATOR = save.g || ''; process.env.ZH13_ONLY_EMAILS = save.l || ''
})

ok('тревога: начало подписи больше 15%, проблема больше 20%, от 10 текстов', () => {
  const row = (p: string, pr: string[] = []) => ({ user_id: 'u', podpis_nachalo: p, pervye_slova: 'x', problemy: pr, vid: 'reels' })
  assert.deepEqual(vysheePoroga(Array.from({ length: 9 }, () => row('иногда мы', ['moral']))), [])
  const rows = [...Array.from({ length: 3 }, () => row('иногда мы')), ...Array.from({ length: 7 }, (_, i) => row(`другое ${i}`))]
  assert.equal(vysheePoroga(rows).length, 1)
  const rows2 = Array.from({ length: 10 }, (_, i) => row(`н ${i}`, i < 3 ? ['moral'] : []))
  assert.match(vysheePoroga(rows2)[0], /Мораль/)
})

// сохраненные тексты опыта: разбор и проверка без денег
const file = process.argv[2]
if (file && existsSync(file)) {
  const R = JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>
  const KOD: Record<string, string> = { r1: 'mysl', r2: 'mysl', r3: 'mysl', r4: 'sessiya', r5: 'sessiya', r6: 'scenka', r7: 'perevod', r8: 'voprosy', r9: 'kommentariy', r10: 'ekran', k1: 'karusel', k2: 'karusel', p1: 'p_priznanie', p2: 'p_razoblachenie', p3: 'p_paradoks' }
  const svod: Record<string, number> = {}
  let vsego = 0
  for (const x of Object.values(R)) {
    if (!x?.text || !['R3', 'K1', 'P1'].includes(x.variant)) continue
    const f = formatPo(KOD[String(x.zadanie).split(':')[1]] || 'mysl')!
    const r = razobrat(x.text, f)
    assert.ok(r.glavnoe.length > 50, `${x.key}: пустое главное`)
    assert.ok(!/^(Речь|В кадре|Текст на экране)\s*:/m.test(r.glavnoe), `${x.key}: метка в главном`)
    if (f.vid !== 'post') assert.ok(r.podpis, `${x.key}: нет подписи`)
    const p = proverit({ f, syroe: x.syroe || x.text, tekst: r.tekst, glavnoe: r.glavnoe, podpis: r.podpis, obrazcy: [], kusok: '', opora: x.opora, poslednyayaOpora: null, auditoriyaZhenshiny: x.psiholog === 'p1' })
    vsego++
    for (const k of p.problemy) svod[k] = (svod[k] || 0) + 1
    console.log(`  ${x.key} ${f.kod}: главное ${r.glavnoe.split(/\s+/).length} слов, подпись «${p.podpisNachalo}», начало «${p.pervyeSlova}», ритм ${p.blizost}, проблемы: ${p.problemy.join(', ') || 'нет'}`)
  }
  console.log(`  сохраненных текстов ${vsego}, проблемы:`, svod)
  n++
}

console.log(`\nвсе ${n} проверок прошли`)
