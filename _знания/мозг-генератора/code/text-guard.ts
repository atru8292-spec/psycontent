// text-guard.ts: проверка текста кодом, без модели.
// 1) autofix: чистка сгенерированного текста и образцов психолога (тире, ё, разметка).
// 2) cleanSample: подготовка образцов к П0 (склейка строк, разорванных при копировании из инстаграма, срез ссылок).
// 3) guard: находки для П4 (штампы, зачины, цифры, повторы, длина).
// 4) extractOpening, findSignatures: память о заходах и фирменных оборотах.
// Все регулярки с флагом u и границами через \p{L}: в JS \b не понимает кириллицу.

export type FormatCode = 'post' | 'carousel' | 'reels_monolog' | 'reels_scenka' | 'stories';
export type GuardFinding = { rule: string; quote: string };
export type GuardResult = { text: string; findings: GuardFinding[]; metrics: Record<string, number | boolean> };

const L = '\\p{L}';
const LL = '[\\p{L}]';
const W = (s: string) => new RegExp(`(?<![${L}])(?:${s})(?![${L}])`, 'giu');

// ---------- 1. Автозамены ----------
// Безопасные замены делаются молча. Тире внутри фразы код НЕ заменяет запятой (выходит криво:
// «Люди, просто люди»), а отдает находкой 'tire' в П4/П5: модель перестраивает фразу.
// После последней правки вызывается finalNet: оставшиеся тире заменяются, чтобы в выдачу они не попали.
export function autofix(input: string): string {
  let t = input;
  t = t.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  // тире в начале строки (реплики диалога) убираем, перенос сохраняем
  t = t.replace(/^([ \t]*)[—–][ \t]*/gmu, '$1');
  // «X — это Y» и «X - это Y»: тире просто убираем
  t = t.replace(/[ \t]+(?:[—–]|-)[ \t]+(?=это(?![\p{L}]))/gu, ' ');
  // диапазоны чисел: «20 — 30» → «20-30»
  t = t.replace(/(\d)[ \t]*[—–][ \t]*(\d)/gu, '$1-$2');
  // **жирный** снимаем только как обертку фразы; цензура мата «х**ня» остается
  t = t.replace(new RegExp(`(?<![${L}*])\\*\\*([^*\\n]+?)\\*\\*(?![${L}*])`, 'gu'), '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  return t;
}

// Страховка после всех правок: если тире все же остались, меняем на запятую.
export function finalNet(input: string): string {
  let t = autofix(input);
  t = t.replace(/[ \t]+[—–-][ \t]+/gu, ', ').replace(/[—–]/gu, '-');
  t = t.replace(/,\s*,/g, ',').replace(/,\s*([.!?])/g, '$1');
  return t;
}

// ---------- 2. Подготовка образцов к П0 ----------
// Тире внутри фраз в образцах оставляем как есть: это речь автора, а запрет тире живет в правилах генерации.
export function cleanSample(input: string): string {
  let t = input;
  t = t.replace(/https?:\/\/\S+/g, '').replace(/t\.me\/\S+/g, '');
  // строки из 1-2 слов подряд (след жирного шрифта при копировании) склеиваем с соседями;
  // строки, которые начинаются не с буквы (эмодзи, маркер списка, цифра), не трогаем
  const lines = t.split('\n');
  const out: string[] = [];
  const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const startsWithLetter = (s: string) => /^\p{L}/u.test(s.trim());
  for (const line of lines) {
    const prev = out.length ? out[out.length - 1] : '';
    const closed = /[.!?:…)]$/u.test(prev.trim());
    const canMerge = wc(line) > 0 && wc(prev) > 0 && !closed && startsWithLetter(line);
    if (canMerge && (wc(line) <= 2 || wc(prev) <= 2)) out[out.length - 1] = prev.trimEnd() + ' ' + line.trim();
    else out.push(line);
  }
  let r = out.join('\n');
  r = r.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  r = r.replace(new RegExp(`(?<![${L}*])\\*\\*([^*\\n]+?)\\*\\*(?![${L}*])`, 'gu'), '$1');
  return r;
}

// ---------- 3. Находки ----------
const RULES: Array<{ rule: string; re: RegExp }> = [
  // «не X, а Y» и родственники
  { rule: 'ne_x_a_y', re: new RegExp(`(?<![${L}])не\\s+(?:[${L}-]+\\s+){0,6}?[${L}-]+\\s*,\\s*а\\s`, 'giu') },
  { rule: 'ne_x_a_y', re: new RegExp(`(?<![${L}])это\\s+не\\s+(?:про|о|об|в|просто)?[^.!?\\n]{0,60}?[,.]\\s*(?:это|а)\\s`, 'giu') },
  { rule: 'ne_x_a_y', re: new RegExp(`(?<![${L}])дело\\s+не\\s+в\\s[^.!?\\n]{0,60}?,\\s*а\\s`, 'giu') },
  { rule: 'ne_x_a_y', re: new RegExp(`не\\s+потому,?\\s+что[^.!?\\n]{0,80}[.,]\\s*а\\s+потому`, 'giu') },
  { rule: 'ne_x_a_y', re: new RegExp(`(?<![${L}])[${L}-]+\\s*,\\s*а\\s+не\\s+[${L}-]+`, 'giu') },
  // скрытые противопоставления: «...не делает тебя X. Так психика...», «Выглядит как X. Скорее это Y», «редко X, чаще Y»
  { rule: 'skrytoe_protivopostavlenie', re: new RegExp(`(?<![${L}])не\\s[^.!?\\n]{2,60}[.!?]\\s+(?:Так|Скорее|Чаще|Просто|Это)\\s`, 'gu') },
  { rule: 'skrytoe_protivopostavlenie', re: new RegExp(`(?<![${L}])выгляд${LL}*\\s+как\\s[^.!?\\n]{2,60}[.!?,]\\s*(?:скорее|а на деле|на деле)\\s`, 'giu') },
  { rule: 'skrytoe_protivopostavlenie', re: new RegExp(`(?<![${L}])редко\\s[^.!?\\n]{2,60}[.!?,]\\s*чаще\\s`, 'giu') },
  { rule: 'skrytoe_protivopostavlenie', re: new RegExp(`(?<![${L}])ни\\s[^.!?\\n]{1,40},?\\s*ни\\s[^.!?\\n]{1,40}[.!?,]\\s*(?:есть|а есть|зато)\\s`, 'giu') },
  { rule: 'skrytoe_protivopostavlenie', re: /(?:^|[.!?]\s+)Не\s[^.!?\n]{2,60}[.!?]\s+(?:Это|Скорее|Чаще)\s/gmu },
  // запрещенные зачины (только в начале строки)
  { rule: 'zachin', re: /^\s*(?:(?:Слайд\s*\d+|Экран\s*\d+|Речь|Текст на экране|[АБAB])\s*:\s*)?(?:ты когда-нибудь|вы когда-нибудь|бывает(?:,)? так,? что|бывает,? что|сегодня хочу (?:поговорить|рассказать)|друзья,|итак,|давай(?:те)? честно|скажу прямо|(?:\d+|три|пять|семь|десять)\s+признак\S*,?\s+(?:что|того,? что)\s+(?:вам|тебе)\s+пора)/gimu },
  { rule: 'na_samom_dele', re: W('на самом деле') },
  { rule: 'eto_mozhet', re: W('это может') },
  { rule: 'schet_vsluh', re: W(`в\\s+(?:\\d+-?[йм]|сот${LL}*|тысячн${LL}*|десят${LL}*|двадцат${LL}*|сороков${LL}*|пятидесят${LL}*|очередно${LL}*)\\s+раз|(?:одиннадцать|двенадцать|двадцать|сорок|сто)\\s+раз`) },
  { rule: 'tik_tak_psihika', re: W(`так\\s+(?:психика|тело|мозг|нервная система)`) },
  { rule: 'infobiz', re: W(`трансформаци${LL}*|лучш${LL}* верси${LL}* себя|ресурсн${LL}*|в ресурсе|раскр${LL}* потенциал|гармони${LL}*|безопасн${LL}* пространств${LL}*|путь к себе|принять себя|истинн${LL}* сущност${LL}*|точк${LL}* роста`) },
  { rule: 'zhargon', re: W(`контейнир${LL}*|прожить эмоци${LL}*|прожива${LL}* эмоци${LL}*|в контакте с собой|проработ${LL}*|экологичн${LL}*`) },
  { rule: 'kancelyarit', re: W(`данн(?:ый|ая|ое|ые|ого|ой|ом|ых)|является|являются|осуществл${LL}*|в рамках|посредством|важно отметить|стоит отметить|следует отметить|таким образом|кроме того|в современном мире|при этом`) },
  { rule: 'zatertye_obrazy', re: W(`невидим${LL}* нит${LL}*|мост${LL}* между|как растени${LL}*|уютн${LL}* плед${LL}*|внутренн${LL}* компас${LL}*|внутренн${LL}* ребен${LL}*|внутренн${LL}* ребён${LL}*`) },
  { rule: 'dezhurnyy_final', re: /(?:поделись|поделитесь|напиши|напишите|расскажи|расскажите)[^.!?\n]{0,20}в комментари|как (?:ты|вы) относи(?:шься|тесь) к|узнал[иа]? себя\?/giu },
  { rule: 'dlya_vseh', re: /независимо от (?:пола|возраста)|мужчины,? женщины,? (?:и )?дети/giu },
  { rule: 'cifry', re: /\d{1,3}(?:[.,]\d+)?\s?%|\d+\s+из\s+\d+\s+(?:человек|клиент|женщин|мужчин)/giu },
  { rule: 'issledovaniya', re: W(`исследовани${LL}* показ${LL}*|учен${LL}* доказал${LL}*|по данным|доказано,? что`) },
  { rule: 'budushchie_posty', re: /(?:в следующем посте|на этой неделе расскажу|скоро расскажу|продолжение следует)/giu },
  { rule: 'zaglushka', re: /\[добавь[^\]]*\]/giu },
  { rule: 'tire', re: /[^\n]{0,30}[ \t][—–-][ \t][^\n]{0,30}/gu },
];

// сколько раз правило допустимо, прежде чем стать находкой
const THRESHOLD: Record<string, number> = { eto_mozhet: 2, tik_tak_psihika: 2 };

// ---------- 4. Память ----------
// Первая «настоящая» строка материала без служебных меток формата.
export function extractOpening(text: string, format: FormatCode): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const LABEL = /^(?:Слайд\s*\d+|Экран\s*\d+|Текст на экране|Речь|Подпись|Персонажи|[АБ]|[AB])\s*[:.]\s*/iu;
  if (format === 'reels_scenka') {
    const firstReplica = lines.find(l => /^[АБAB]\s*:/u.test(l));
    return (firstReplica || lines[0] || '').replace(LABEL, '');
  }
  if (format === 'reels_monolog') {
    const speech = lines.find(l => /^Речь\s*:/iu.test(l));
    return (speech || lines[0] || '').replace(LABEL, '');
  }
  return (lines[0] || '').replace(LABEL, '');
}

export function findSignatures(text: string, signatures: string[]): string[] {
  const low = text.toLowerCase().replace(/ё/g, 'е');
  return signatures.filter(s => s.trim().split(/\s+/).length >= 2 && low.includes(s.toLowerCase().replace(/ё/g, 'е')));
}

function sentences(t: string): string[] {
  return t.split(/(?<=[.!?…])\s+|\n+/u).map(s => s.trim()).filter(s => /\p{L}/u.test(s));
}

export function guard(
  raw: string,
  opts: { format: FormatCode; lastOpenings?: string[]; maxChars?: number; signatures?: string[] }
): GuardResult {
  const text = autofix(raw);
  const findings: GuardFinding[] = [];
  for (const { rule, re } of RULES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) findings.push({ rule, quote: m[0].trim().slice(0, 120) });
  }
  // дежурный финал считается, только если он в последних 250 знаках
  const tailStart = Math.max(0, text.length - 250);
  for (let i = findings.length - 1; i >= 0; i--) {
    if (findings[i].rule === 'dezhurnyy_final' && text.lastIndexOf(findings[i].quote) < tailStart) findings.splice(i, 1);
  }
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.rule] = (counts[f.rule] || 0) + 1;

  const cleaned = findings
    .filter(f => !(f.rule in THRESHOLD) || counts[f.rule] >= THRESHOLD[f.rule])
    // дубли: одна находка, пойманная двумя регулярками одного правила
    .filter((f, i, arr) => !arr.some((g, j) => j !== i && g.rule === f.rule && g.quote.length > f.quote.length && g.quote.includes(f.quote)));

  // повтор захода: первые 5 слов без служебных меток
  const first5 = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
  const opening = first5(extractOpening(text, opts.format));
  const repeatOpening = !!opening && (opts.lastOpenings || []).some(o => first5(o) === opening);
  if (repeatOpening) cleaned.push({ rule: 'povtor_zahoda', quote: opening });

  // фирменные обороты: больше одного на материал
  const sig = findSignatures(text, opts.signatures || []);
  if (sig.length > 1) cleaned.push({ rule: 'mnogo_firmennyh', quote: sig.join(' | ') });

  // монотонность: только пост от 8 предложений
  const sents = sentences(text);
  const lens = sents.map(s => s.split(/\s+/).length);
  const mean = lens.reduce((a, b) => a + b, 0) / Math.max(lens.length, 1);
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(lens.length, 1));
  const monotone = opts.format === 'post' && text.length > 400 && lens.length >= 8 && sd < 3;
  if (monotone) cleaned.push({ rule: 'monotonno', quote: `разброс длины фраз ${sd.toFixed(1)} слова` });

  // длина: допуск 10%, тот же, что в П4
  const tooLong = opts.maxChars ? text.length > opts.maxChars * 1.1 : false;
  if (tooLong) cleaned.push({ rule: 'dlina', quote: `${text.length} знаков при лимите ${opts.maxChars}` });

  return {
    text,
    findings: cleaned,
    metrics: { chars: text.length, sentences: lens.length, sd_words: +sd.toFixed(1), monotone, repeatOpening, signatures_used: sig.length },
  };
}
