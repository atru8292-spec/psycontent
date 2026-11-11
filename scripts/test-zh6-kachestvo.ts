// Тесты проверок качества zh6 (lib/generation/zh6/kachestvo.ts), без модели и без сети:
//   OPENAI_API_KEY=test-bez-seti npx tsx scripts/test-zh6-kachestvo.ts
// Для каждой проверки: ловит пример из замечаний Арины 11.11, не ловит похожий живой случай; на корпусе живых
// текстов (банки zh6 в репо и _знания основной папки, если есть) ни одного срабатывания.
import assert from 'node:assert/strict'
import { samopredstavlenie, podvodka, vopros3, vrachAbzac, scenkaDlinno, abstrakciya, kachestvoMesta, dazheVKonce, dazheTik, ramkaKabineta, oblozhkaDlinno, podpisPereskaz } from '../lib/generation/zh6/kachestvo'
import { PRIMERY } from '../lib/generation/zh6/primery'
import { zh6MemFromRows } from '../lib/generation/memory'
import { defaultAbout } from '../lib/carousel/server'
import { korpus } from './zh6/kachestvo-kalibr'

const codes = (m: { code: string }[]) => m.map(x => x.code)

// 1. самопредставление по шаблону
assert.deepEqual(codes(samopredstavlenie('Слайд 8: Вина еще не значит, что ты подвела.\n\nСлайд 9: Я психолог, пишу о стрессе и выгорании. А какой фразой ты поднимаешь себя с дивана?\n\nПодпись: Можно лежать весь день.', { intro: false })), ['samopredstavlenie'])
assert.deepEqual(codes(samopredstavlenie('Слайд 1: текст\n\nПодпись: Психолог, работаю с темой выгорания. Пишите в директ.', { intro: false })), ['samopredstavlenie'], 'шаблон в подписи без просьбы')
assert.deepEqual(codes(samopredstavlenie('Слайд 1: текст\n\nПодпись: Я Ольга, психолог, помогаю тем, кто устал тащить все на себе.', { intro: true })), [], 'в подписи по просьбе можно')
assert.deepEqual(codes(samopredstavlenie('Мне как психологу часто пишут про отпуск. Я сама так делала.', { intro: false })), [], 'просто слово «психолог» без шаблона')
console.log('ok 1: самопредставление')

// 2. подводка
assert.deepEqual(codes(podvodka('Но как расслабиться? Здесь стоит присмотреться: тебя правда просят?')), ['podvodka'])
assert.deepEqual(codes(podvodka('Слайд 1: Три вопроса, которые стоит задать себе перед ссорой')), [], 'заголовок живой карусели')
console.log('ok 2: подводка')

// 3. вопросы-задания после двоеточия
const tri = 'Здесь стоит присмотреться: тебя действительно постоянно просят вмешаться или ты сама проверяешь? Что случится, если ответить позже на сообщение? Кто сможет разобраться без тебя, пусть даже по-своему?'
assert.deepEqual(codes(vopros3(tri)), ['vopros3'])
assert.deepEqual(codes(vopros3('Знакомо? Узнала себя? А что дальше?')), [], 'короткие риторические вопросы без подводки')
assert.deepEqual(codes(vopros3('А что со мной не так? Может быть у меня плохие отношения с мамой или слабая фигура отца? Но вы выбираете, оставить этого человека рядом или нет, правда?')), [], 'цепочка вопросов в живом рилсе')
console.log('ok 3: вопросы-задания')

// 4. оговорка про врача отдельным абзацем
const vr = 'Ты лежишь у бассейна и проверяешь чат.\n\nК вечеру ты уже устала.\n\nПо одной усталости причину не определить. Влияют и нагрузка, и сон, и здоровье. Если усталость долго не проходит, стоит обратиться к врачу.\n\nА фразу «отдыхай» иногда приходится перечитать.'
assert.deepEqual(codes(vrachAbzac(vr)), ['vrach_abzac'])
assert.deepEqual(codes(vrachAbzac('Ты лежишь и проверяешь чат.\n\nК вечеру устала, хотя весь день лежала, а если так месяц подряд, сходи к врачу и проверь щитовидку, а потом приходи ко мне разбираться, почему тебе нельзя отдыхать без вины и почему ты все время на связи.\n\nКонец.')), [], 'врач одной фразой внутри длинного живого абзаца')
console.log('ok 4: врач абзацем')

// 5. длинная сценка
const repl = (n: number) => ['Текст на экране: Все знаю, а сил нет', 'Речь:', ...Array.from({ length: n }, (_, i) => `${i % 2 ? 'Психолог' : 'Клиентка'}: реплика номер ${i + 1}.`), 'Подпись: что-то свое.'].join('\n')
assert.deepEqual(codes(scenkaDlinno(repl(12), true)), ['scenka_dlinno'])
assert.deepEqual(codes(scenkaDlinno(repl(6), true)), [], 'шесть реплик норма')
assert.deepEqual(codes(scenkaDlinno(repl(12), false)), [], 'не сценка')
assert.deepEqual(codes(scenkaDlinno('Речь: Клиентка: первая.\nПсихолог: вторая.\nКлиентка (смеется): третья.', true)), [], 'ремарка в скобках и метка Речь на одной строке')
console.log('ok 5: длинная сценка')

// 6. противопоставление с абстракцией
assert.deepEqual(codes(abstrakciya('Отель забронирован на неделю, а готовность немедленно включиться осталась с тобой круглосуточно.')), ['abstrakciya'])
assert.deepEqual(codes(abstrakciya('Отпуск закончился, а усталость от этого не делась бы, если бы ты отдыхала.')), [], 'без глагола «осталась/живет»')
assert.deepEqual(codes(abstrakciya('Он ушел на работу, а я осталась дома с детьми.')), [], 'конкретное лицо')
console.log('ok 6: абстракция')

// 7. живые тексты: ни одного срабатывания (жесткий режим: рамка кабинета у всех, «даже» как будто уже было дважды).
// Обложку здесь не считаем: у трети живых каруселей обложка длиннее 9 слов, а правило «до 9» решение Арины 11.11
// (длинные живые обложки не эталон для наших), его проверяет тест 11
const live = korpus()
assert.ok(live.length >= 200, `корпус ${live.length}`)
const lozh = live.flatMap(z => kachestvoMesta(z.text, { intro: false, scene: z.scene, format6: 'post_kabinet', prevDazhe: [] }).map(m => `${z.id}: ${m.code}: ${m.quote.slice(0, 80)}`))
const dazheLive = live.filter(z => dazheVKonce(z.text)).length
assert.ok(dazheLive / live.length < 0.05, `«даже» в конце у ${dazheLive} живых`)
assert.deepEqual(lozh, [], `ложные срабатывания на живых:\n${lozh.join('\n')}`)
console.log(`ok 7: ${live.length} живых текстов без срабатываний`)

// 8. строка «о себе» на финале карусели без шаблона из ниши
assert.equal(defaultAbout({ one_niche: 'Выгорание и стресс' }), 'Психолог')
assert.equal(defaultAbout({ one_niche: 'Выгорание и стресс', blog_about: 'Пишу про усталость, которую не лечит отпуск.' }), 'Психолог. Пишу про усталость, которую не лечит отпуск')
assert.equal(defaultAbout({ blog_about: 'x'.repeat(90) }), 'Психолог')
assert.ok(!/работаю с темой/.test(defaultAbout({ one_niche: 'Тревога' })))
console.log('ok 8: строка о себе без шаблона')

// 9. тик «даже» в конце: ловим, если было и в одном из двух прошлых материалов автора
const sDazhe = 'Ты лежишь и думаешь о делах. Даже когда все уже сделано.'
assert.ok(dazheVKonce(sDazhe) && dazheVKonce('Слайд 1: текст\n\nПодпись: Даже полежать хочется с пользой.'))
assert.ok(!dazheVKonce('Даже не знаю, с чего начать. А закончу просто.'), '«даже» не в последней фразе')
assert.deepEqual(codes(dazheTik(sDazhe, [false, true])), ['dazhe'])
assert.deepEqual(codes(dazheTik(sDazhe, [true, false, false])), [], 'было три текста назад, не тик')
assert.deepEqual(codes(dazheTik(sDazhe, [])), [], 'первый текст автора')
const mem = zh6MemFromRows([{ content: 'Новый. Даже так.', check_result: { zh4: { zh6: { ustr: 'post_direkt' } } } }, { content: 'Старый. Просто так.', check_result: { zh4: { zh6: { ustr: 'post_kabinet' } } } }])
assert.deepEqual(mem.dazhe, [false, true], 'память: по порядку, последний в конце')
console.log('ok 9: тик «даже»')

// 10. рамка консультации только в «Истории из кабинета»
const kab = 'В такой собирательной истории женщина перечисляет дела. Вот на это я бы обратила внимание. В работе здесь я бы спросила: кто моет?'
assert.deepEqual(codes(ramkaKabineta(kab, 'post_kabinet')), ['ramka_kabineta'])
assert.deepEqual(codes(ramkaKabineta('Я бы спросила, что ты сейчас чувствуешь.', 'reels_golova')), [], 'другой формат')
assert.deepEqual(codes(ramkaKabineta('Я спрашиваю: кто моет посуду? Она молчит.', 'post_kabinet')), [], 'прямо, без «я бы»')
console.log('ok 10: рамка кабинета')

// 11. обложка карусели до 9 слов (первая строка слайда 1, подзаголовок строкой ниже не считается)
assert.deepEqual(codes(oblozhkaDlinno('Слайд 1: 4 признака, что дома ты уже делаешь все за двоих, а он считает, что тебя все устраивает\nСлайд 2: текст', true)), ['oblozhka'])
assert.deepEqual(codes(oblozhkaDlinno('Слайд 1: Ты делаешь все за двоих\nА он не замечает, и это давно\nСлайд 2: текст', true)), [], 'подзаголовок строкой ниже')
assert.deepEqual(codes(oblozhkaDlinno('Слайд 1: очень длинная обложка из многих лишних слов для проверки порога длины\nСлайд 2: x', false)), [], 'не карусель')
console.log('ok 11: обложка')

// 12. подпись пересказывает ролик: утренняя сценка 11.11 ловится, живые подписи банка нет (их всего 3, порог осторожный).
// Надпись, повторяющая первую реплику, кодом не ловится: у трети живых рилсов так (только правило в NADPIS)
const scenka = 'Текст на экране: Все знаю, а сил сделать нет\n\nРечь:\nКлиентка: Сохранила пост про отдых и опять открыла рабочую переписку.\nПсихолог: Ты ждешь от себя сил, которые уже потратила.\nКлиентка: Легла и ругала себя. Опять ничего для себя не сделала, а сил оставалось только лежать.\n\nПодпись: Можно знать, как себе помочь, и быть слишком уставшей даже для этого. Еще и ругать себя за усталость.'
assert.deepEqual(codes(podpisPereskaz(scenka, { thought: 'Можно знать, как себе помочь, и быть слишком уставшей для этого', quote: '' })), ['podpis_pereskaz'], 'цепочка из мысли ядра')
assert.deepEqual(codes(podpisPereskaz('Речь: Я стираю полотенца, он сидит с телефоном, полотенца опять закончились.\n\nПодпись: Полотенца он стирает редко, а закончившиеся полотенца замечает сразу и сидит с телефоном.')), ['podpis_pereskaz'], 'больше половины слов из речи')
assert.deepEqual(codes(podpisPereskaz('Речь: Я стираю полотенца, он сидит с телефоном.\n\nПодпись: Сняла это после третьей клиентки за неделю с тем же вопросом. А у вас кто дома стирает?')), [], 'повод и вопрос зрителю')
const zhivyePodpisi = PRIMERY.filter(x => /^\s*Подпись\s*:/m.test(x.text))
assert.ok(zhivyePodpisi.length >= 3)
for (const x of zhivyePodpisi) assert.deepEqual(codes(podpisPereskaz(x.text)), [], `живая подпись ${x.id}`)
console.log(`ok 12: подпись, ${zhivyePodpisi.length} живых подписи без срабатываний`)

console.log('все тесты качества zh6 прошли')
