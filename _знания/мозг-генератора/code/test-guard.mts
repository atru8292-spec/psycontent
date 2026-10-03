import { guard, autofix, cleanSample, extractOpening } from './text-guard.ts';
const cases: [string,string,string?][] = [
 ['ne_x_a_y 1', 'Дело не в лени, а в страхе.'],
 ['ne_x_a_y 2', 'Это не слабость, это защита.'],
 ['ne_x_a_y 3', 'Это не про ребенка. Это про вашу историю.'],
 ['ne_x_a_y 4', 'Выбирай себя, а не его.'],
 ['ne_x_a_y 5', 'Не потому что люди разлюбили. А потому что устали.'],
 ['hidden 1', 'Отказ не делает тебя плохой. Так психика защищает границы.'],
 ['hidden 2', 'Выглядит как равнодушие, скорее это усталость.'],
 ['hidden 3', 'Редко это скандал, чаще тишина.'],
 ['ok 1', 'Я не знаю, как это будет. А вы знаете?'],
 ['ok 2', 'Не ешь после шести. Так говорила бабушка, и мы верили.'],
 ['zachin', 'Ты когда-нибудь замечала, что устаешь?\nДрузья, привет'],
 ['zachin priznaki', 'Слайд 1: 5 признаков, что вам пора к психологу\nСлайд 2: три признака того, что тебе пора отдохнуть'],
 ['ok priznaki', 'Три признака усталости я замечаю у себя первой.'],
 ['samom dele', 'А на самом деле все проще.'],
 ['tik', 'Так психика защищается. Потом так тело говорит стоп.'],
 ['cifry', '87% моих клиентов и 8 из 10 женщин так делают.'],
 ['mat', 'Это х**ня какая-то, п*здец.'],
 ['dash hyphen', 'Тишина - это тоже ответ. Он пришел - и ушел. 20 — 30 минут.'],
 ['dialog', '— Спишь?\n— Нет.'],
 ['zaglushka', 'Пишите [добавь: как записаться].'],
];
for (const [name, t] of cases) {
  const r = guard(t, { format: 'post' });
  console.log(name.padEnd(12), '|', JSON.stringify(r.text), '|', r.findings.map(f=>f.rule+':'+f.quote).join(' ; '));
}
console.log('opening carousel:', extractOpening('Слайд 1: Он опять молчит\nСлайд 2: ...', 'carousel'));
console.log('opening scenka:', extractOpening('Текст на экране: Первая сессия\nПерсонажи: А клиентка, Б психолог\nА: У меня все хорошо\nБ: ...', 'reels_scenka'));
console.log('clean sample:', JSON.stringify(cleanSample('Это\nважно\nзнать про себя.\nНовая мысль — вот.\nhttps://t.me/x')));
console.log('sig:', JSON.stringify(guard('Друзья мои, вы не поверите, но так.', {format:'post', signatures:['друзья мои','вы не поверите']}).findings));
import { finalNet } from './text-guard.ts';
console.log('tire find:', JSON.stringify(guard('Люди - просто люди. Он пришел — и ушел.', {format:'post'}).findings));
console.log('finalNet:', finalNet('Люди — просто люди. Тишина - это ответ.'));
console.log('ni-ni:', JSON.stringify(guard('Ни злости, ни обиды нет, есть усталость.', {format:'post'}).findings));
console.log('clean2:', JSON.stringify(cleanSample('Вот\nэто\nважно.\n✔️ Пункт первый\n🔥 - мерзко')));
console.log('schet:', JSON.stringify(guard('Ты в сотый раз проверяешь телефон. Одиннадцать раз за вечер. В 5-й раз.', {format:'post'}).findings));
console.log('zachin label:', JSON.stringify(guard('Слайд 1: Ты когда-нибудь думала?', {format:'carousel'}).findings));
console.log('Ne cap:', JSON.stringify(guard('Не лень. Это страх.', {format:'post'}).findings));
console.log('final mid:', JSON.stringify(guard('Напишите в комментариях, что думаете. '+'Текст идет дальше и дальше. '.repeat(15), {format:'post'}).findings.map(f=>f.rule)));
console.log('finalNet hyphen:', finalNet('Люди - просто люди'));
