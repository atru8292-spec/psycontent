// text-guard.ts: проверка текста кодом, без модели.
// 1) autofix: чистка сгенерированного текста и образцов психолога (тире, ё, разметка).
// 2) cleanSample: подготовка образцов к П0 (склейка строк, разорванных при копировании из инстаграма, срез ссылок).
// 3) guard: находки для П4 (штампы, зачины, цифры, повторы, длина).
// 4) extractOpening, findSignatures: память о заходах и фирменных оборотах.
// Все регулярки с флагом u и границами через \p{L}: в JS \b не понимает кириллицу.

export type FormatCode = 'post' | 'post_tg' | 'carousel' | 'reels_monolog' | 'reels_otvet' | 'reels_spisok' | 'reels_istoriya' | 'reels_poslanie' | 'reels_scenka' | 'reels_rol' | 'reels_doska' | 'reels_bez_slov' | 'reels_malysh' | 'stories' | 'reels_auto';
// Виды рилсов (из разбора 71 рилса). reels_auto: вид выбирает план, до П2 он заменяется на один из этих.
export const REELS_FORMATS = ['reels_monolog', 'reels_otvet', 'reels_spisok', 'reels_istoriya', 'reels_poslanie', 'reels_scenka', 'reels_rol', 'reels_doska', 'reels_bez_slov', 'reels_malysh'] as const;
export const ALL_FORMATS: FormatCode[] = ['post', 'post_tg', 'carousel', ...REELS_FORMATS, 'stories'];
export const isReels = (f: string) => f === 'reels_auto' || (REELS_FORMATS as readonly string[]).includes(f);
// Служебные метки формата в начале строки: их не считаем текстом (зачины, двоеточия, рубленые фразы).
const LABELS = 'Слайд\\s*\\d+|Экран\\s*\\d+|Текст на экране|Крупно на экране|Итог на схеме|Речь|Подпись|Персонажи|Обложка|Кадр|Рисую|[АБAB](?:\\s*\\([^)\\n]{1,40}\\))?';
export const LABEL_RE = new RegExp(`^\\s*(?:${LABELS})\\s*[:.]\\s*`, 'iu');
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
  { rule: 'skrytoe_protivopostavlenie', re: new RegExp(`(?<![${L}])не\\s[^.!?\\n]{2,60}[.!?]\\s+(?:Так(?!\\s+что)|Скорее|Чаще|Просто|Это)\\s`, 'gu') },
  { rule: 'skrytoe_protivopostavlenie', re: new RegExp(`(?<![${L}])выгляд${LL}*\\s+как\\s[^.!?\\n]{2,60}[.!?,]\\s*(?:скорее|а на деле|на деле)\\s`, 'giu') },
  { rule: 'skrytoe_protivopostavlenie', re: new RegExp(`(?<![${L}])редко\\s[^.!?\\n]{2,60}[.!?,]\\s*чаще\\s`, 'giu') },
  { rule: 'skrytoe_protivopostavlenie', re: new RegExp(`(?<![${L}])ни\\s[^.!?\\n]{1,40},?\\s*ни\\s[^.!?\\n]{1,40}[.!?,]\\s*(?:есть|а есть|зато)\\s`, 'giu') },
  { rule: 'skrytoe_protivopostavlenie', re: /(?:^|[.!?]\s+)Не\s[^.!?\n]{2,60}[.!?]\s+(?:Это|Скорее|Чаще)\s/gmu },
  // запрещенные зачины (только в начале строки)
  { rule: 'zachin', re: /^\s*(?:(?:Слайд\s*\d+|Экран\s*\d+|Речь|Текст на экране|[АБAB])\s*:\s*)?(?:ты когда-нибудь|вы когда-нибудь|бывает(?:,)? так,? что|бывает,? что|сегодня хочу (?:поговорить|рассказать)|друзья,|итак,|давай(?:те)? честно|скажу прямо|(?:\d+|три|пять|семь|десять)\s+признак\S*,?\s+(?:что|того,? что)\s+(?:вам|тебе)\s+пора)/gimu },
  { rule: 'na_samom_dele', re: W('на самом деле') },
  // заготовки психолога-нейросети, которые повторяются из текста в текст
  { rule: 'zagotovka', re: W(`за\\s+этим\\s+(?:(?:может|часто|иногда|обычно)\\s+)?сто${LL}*|вроде\\s+мелочь|ну\\s+что\\s+такого`) },
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
  // «не про X, про Y» без «это»: «Тут не про деньги, про страх», «Речь не о лени. Речь о страхе»
  { rule: 'ne_x_a_y', re: new RegExp(`(?<![${L}])(?<!это\\s)не\\s+(?:про|о|об)\\s[^.!?\\n]{1,60}?[,.]\\s*(?:а\\s+)?(?:(?:это|речь|тут|здесь)\\s+)?(?:про|о|об)\\s`, 'giu') },
  // пафос: «вот тут и начинается настоящая магия», «в этом вся сила»
  { rule: 'pafos', re: W(`(?:вот\\s+|и\\s+)?(?:тут|здесь|именно\\s+(?:тут|здесь)|с\\s+этого|отсюда)\\s+(?:и\\s+)?начина${LL}*|настоящ${LL}*\\s+магия|магия\\s+(?:случа${LL}*|происход${LL}*|начина${LL}*)|в\\s+этом\\s+(?:и\\s+)?(?:есть\\s+|вся\\s+|весь\\s+)?(?:сила|магия|суть|красота|секрет|смысл)|это\\s+меняет\\s+вс[её]|и\\s+знаешь\\s+что|самое\\s+(?:важное|главное|интересное)\\s*[:,]`) },
  // мини-вывод отдельной фразой: «И это нормально.», «Вот и все.», «В этом разница.»
  { rule: 'mini_vyvod', re: /(?<=^|[.!?…]\s+|Слайд\s*\d+\s*:\s*)(?:И\s+)?(?:это|в этом|вот|так)\s+(?:и\s+)?(?:есть\s+)?(?:нормально|важно|ключ\S*|суть|разница|главное|и все|все|работает|честно|сила|правда)[.!…]/gimu },
  // вводные слова, которыми нейросеть подпирает мысль
  { rule: 'vvodnye', re: W(`по\\s+сути|по\\s+большому\\s+счету|в\\s+конечном\\s+(?:итоге|счете)|важно\\s+понимать|стоит\\s+понимать|нужно\\s+понимать|безусловно|несомненно|иными\\s+словами|другими\\s+словами|проще\\s+говоря|как\\s+ни\\s+странно|что\\s+(?:важно|интересно|характерно)\\s*,|по-настоящему|(?:иногда\\s+|часто\\s+)?за\\s+этим\\s+(?:часто\\s+|иногда\\s+)?(?:может\\s+)?сто${LL}*`) },
  // кальки и неживые обороты: так не говорят на кухне
  { rule: 'kalka', re: W(`готов${LL}*\\s+к\\s+старту|в\\s+моменте|это\\s+ок|дай\\s+себе\\s+разрешение|дать\\s+себе\\s+разрешение|разреши\\s+себе\\s+быть|сделать\\s+(?:свой\\s+)?выбор\\s+в\\s+пользу|не\\s+(?:твоя|ваша)\\s+ответственность|выйти\\s+из\\s+зоны\\s+комфорта|бросить\\s+себе\\s+вызов|заявк${LL}*\\s+на\\s+контакт|в\\s+своей\\s+голове\\s+всегда|всегда\\s+в\\s+голове|быть\\s+в\\s+контакте|держать\\s+пространство|оставаться\\s+с\\s+(?:этим|чувством)|имеет\\s+смысл|игра${LL}*\\s+(?:важную\\s+|ключевую\\s+)?роль|сделать\\s+разницу|предъяв${LL}*\\s+результат${LL}*|выда${LL}*\\s+результат${LL}*|(?:слишком\\s+)?дорого\\s+(?:вам\\s+|тебе\\s+|нам\\s+)?обход${LL}*|обход${LL}*\\s+(?:вам\\s+|тебе\\s+)?слишком\\s+дорого|прим${LL}*т${LL}*,?\\s+что|это\\s+(?:все\\s+)?про\\s+(?:заботу|любовь|доверие|принятие|границы|ресурс|себя|тебя|вас)`) },
  // образные слова, которые читатель сам про себя не скажет
  { rule: 'obraz', re: W(`придавил${LL}*|придавлива${LL}*|накрыва${LL}*\\s+волной|накрыл${LL}*\\s+волной|разъеда${LL}*\\s+изнутри|пружин${LL}*\\s+внутри|внутри\\s+все\\s+сжима${LL}*|ком\\s+в\\s+горле\\s+из`) },
  // одушевление предметов и чувств: «тишина кричит», «тревога шепчет», «усталость стучится»
  { rule: 'odushevlenie', re: W(`(?:тишин${LL}*|пустот${LL}*|тревог${LL}*|страх${LL}*|стыд${LL}*|усталост${LL}*|вин${LL}|обид${LL}*|одиночеств${LL}*|боль|грусть|печаль|злость|тело|душа|сердце|мысли|время|стены|дом|комната|телефон|кофе|чай|вечер|утро|ночь|город|квартира)\\s+(?:[${L}]+\\s+){0,2}(?:шепч${LL}*|шепта${LL}*|крич${LL}*|зов${LL}*|стуч${LL}*|обним${LL}*|помн${LL}*|улыба${LL}*|плач${LL}*|жд[её]т|ждут|просит|просят|требует|напоминает|знает|знают|смотрит|смотрят|говорит|говорят|поселя${LL}*|приходит\\s+в\\s+гости|дышит|молчит\\s+в\\s+ответ|хранит|хранят)`) },
  { rule: 'tire', re: /[^\n]{0,30}[ \t][—–-][ \t][^\n]{0,30}/gu },
];

// сколько раз правило допустимо, прежде чем стать находкой
const THRESHOLD: Record<string, number> = { eto_mozhet: 2, tik_tak_psihika: 2 };


// ---------- 4. Память ----------
// Первая «настоящая» строка материала без служебных меток формата.
export function extractOpening(text: string, format: FormatCode): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const LABEL = LABEL_RE;
  if (format === 'reels_scenka') {
    const firstReplica = lines.find(l => /^[АБAB](?:\s*\([^)]*\))?\s*:/u.test(l));
    return (firstReplica || lines[0] || '').replace(LABEL, '');
  }
  if (format === 'reels_bez_slov') {
    const screen = lines.find(l => /^Экран\s*\d+\s*:/iu.test(l));
    return (screen || lines[0] || '').replace(LABEL, '');
  }
  if (isReels(format)) {
    // речь: «Речь: ...» или «Речь:» и текст со следующей строки; для роли и доски речь бывает без метки после «Кадр:»
    const i = lines.findIndex(l => /^Речь\s*:/iu.test(l));
    if (i >= 0) {
      const same = lines[i].replace(LABEL, '').trim();
      return same || (lines[i + 1] || '').replace(LABEL, '');
    }
    const firstText = lines.find(l => !LABEL.test(l));
    return (firstText || lines[0] || '').replace(LABEL, '');
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
  opts: { format: FormatCode; lastOpenings?: string[]; maxChars?: number; signatures?: string[]; examples?: string[] }
): GuardResult {
  const text = autofix(raw);
  const findings: GuardFinding[] = [];
  for (const { rule, re } of RULES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) findings.push({ rule, quote: m[0].trim().slice(0, 120) });
  }
  // дежурный финал считается, только если он в последних 250 знаках. В рилсе и карусели призыв в конце по карточке формата
  const tailStart = Math.max(0, text.length - 250);
  for (let i = findings.length - 1; i >= 0; i--) {
    if (findings[i].rule === 'dezhurnyy_final' && (text.lastIndexOf(findings[i].quote) < tailStart || isReels(opts.format) || opts.format === 'carousel')) findings.splice(i, 1);
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

  // псевдоглубина: три и больше рубленых фразы подряд («Тишина. Пустота. И выбор.»). В сценке короткие реплики норма.
  // В карусели считаем внутри одного слайда: короткая фраза на своем слайде (вид «одна мысль на слайд») это норма.
  if (opts.format !== 'reels_scenka' && opts.format !== 'reels_bez_slov') {
    const blocks = opts.format === 'carousel' ? text.split(/\n(?=\s*слайд\s*\d)/iu) : [text]
    for (const block of blocks) {
      const chunks = block.split(/(?<=[.!?…])\s+|\n+/u).map(x => x.replace(LABEL_RE, '').trim()).filter(Boolean)
      let run: string[] = []
      const flush = () => { if (run.length >= 3) cleaned.push({ rule: 'rublenye', quote: run.join(' ').slice(0, 120) }); run = [] }
      for (const c of chunks) {
        const words = c.split(/\s+/).filter(w => /\p{L}/u.test(w)).length
        if (words >= 1 && words <= 3 && /[.!…]$/u.test(c)) run.push(c)
        else flush()
      }
      flush()
    }
  }

  // двоеточия: одно на материал можно, метки формата («Слайд 1:», «Речь:», «А:») и смайлики «:))» не считаются.
  // В карусели по одному на слайд («ярлык: описание» в наборе это навигация), больше уже перебор
  const colons = text.split('\n')
    .map(l => l.replace(LABEL_RE, '').replace(/:-?[)(D]+/g, ''))
    .flatMap(l => (l.match(/[^:\n]{0,40}:(?!\/\/)[^:\n]{0,40}/gu) || []))
  const slideCount = (text.match(/^\s*слайд\s*\d+/gimu) || []).length
  const colonLimit = opts.format === 'carousel' ? Math.max(1, slideCount) : 1
  if (colons.length > colonLimit) cleaned.push({ rule: 'dvoetochiya', quote: colons.slice(0, 3).map(q => q.trim()).join(' | ').slice(0, 120) })

  // монотонность: только пост от 8 предложений
  const sents = sentences(text);
  const lens = sents.map(s => s.split(/\s+/).length);
  const mean = lens.reduce((a, b) => a + b, 0) / Math.max(lens.length, 1);
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(lens.length, 1));
  const monotone = (opts.format === 'post' || opts.format === 'post_tg') && text.length > 400 && lens.length >= 8 && sd < 3;
  if (monotone) cleaned.push({ rule: 'monotonno', quote: `разброс длины фраз ${sd.toFixed(1)} слова` });

  // осторожность: оговорки «часто», «может», «бывает» через фразу делают текст вялым (П2, раздел про смелость)
  const hedges = text.match(/(?<![\p{L}])(?:часто|иногда|бывает|возможно|вероятно|нередко|порой|как правило|может быть|могут|может)(?![\p{L}])/giu) || [];
  // карусель длиннее поста (6-12 слайдов): оговорок допускаем больше
  const hedgeLimit = opts.format === 'carousel' ? 7 : opts.format === 'post_tg' ? 6 : 4;
  if (hedges.length > hedgeLimit) cleaned.push({ rule: 'ostorozhno', quote: `${hedges.length} оговорок: ${[...new Set(hedges.map(h => h.toLowerCase()))].join(', ')}` });

  // копия живого примера: 5 и больше слов подряд из примера (примеры идут в П2 только как устройство)
  const copied = copiedRuns(text, opts.examples || []);
  for (const q of copied.slice(0, 3)) cleaned.push({ rule: 'kopiya_primera', quote: q });

  // длина: допуск 10%, тот же, что в П4
  const tooLong = opts.maxChars ? text.length > opts.maxChars * 1.1 : false;
  if (tooLong) cleaned.push({ rule: 'dlina', quote: `${text.length} знаков при лимите ${opts.maxChars}` });

  return {
    text,
    findings: cleaned,
    metrics: { chars: text.length, sentences: lens.length, sd_words: +sd.toFixed(1), monotone, repeatOpening, signatures_used: sig.length },
  };
}


// Куски из 5 и больше слов подряд, совпадающие с одним из примеров (без учета регистра и знаков).
// Служебные короткие слова тоже считаются: совпадение должно быть дословным.
export function copiedRuns(text: string, examples: string[], n = 5): string[] {
  const norm = (t: string) => t.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const grams = new Set<string>();
  for (const ex of examples) {
    const w = norm(ex);
    for (let i = 0; i + n <= w.length; i++) grams.add(w.slice(i, i + n).join(' '));
  }
  if (!grams.size) return [];
  const w = norm(text);
  const out: string[] = [];
  let i = 0;
  while (i + n <= w.length) {
    if (grams.has(w.slice(i, i + n).join(' '))) {
      let j = i + n;
      while (j < w.length && grams.has(w.slice(j - n + 1, j + 1).join(' '))) j++;
      out.push(w.slice(i, j).join(' '));
      i = j;
    } else i++;
  }
  return out;
}
