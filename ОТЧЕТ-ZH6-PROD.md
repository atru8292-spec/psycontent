# Отчет zh6-prod (10.11): zh6 в чистой ветке от main, дыры плана выкатки, проверки

Для Claude. Арине отдан только `DLYA-ARINY-PROD.md`. Ветка `feat/zh6-prod` в worktree `~/Downloads/psy-zh6-prod` (от main b786e49), ничего не запушено и не смержено. Сервер, база и main не тронуты, миграция только файлом.

## Коротко
- **Потрачено 9.67 ₽ из 50.** Один прогон `scripts/zh6/prod-check.ts`. Учет в `psy-zh5d/_знания/мозг-генератора/test/zh6/TRATY.md`, строка 27 и итог.
- **Без PROMPT_HYP=zh6 все как в main.** Проверено двумя способами:
  - снимок промптов zh+h7 побайтно равен main (`scripts/zh6/snimok-zhh7.ts`);
  - старый путь плана тем вернула к main построчно.
- **Проверки:**
  - test-zh6 (1-11), test-generation, test-carousel и test-analytics проходят;
  - tsc показывает 12 старых ошибок, новых нет;
  - `npm run build` проходит (с временным фиктивным `.env.production.local`).
- **Агенты:** designer-psycont, copywriter-psycont и reviewer-psycont. Их замечания учтены, остаток записан ниже и в `ВОПРОСЫ-АРИНЕ.md` (2-6).
- **Готово к включению на тестовом аккаунте**, если на сервере `NEW_GENERATION_PIPELINE=on`.

## Для Claude: что сделано и как

### Коммиты (main..feat/zh6-prod)
- 97618b4: снимок промптов zh+h7 на чистом main (`scripts/fixtures/snimok-zhh7-main.json`).
- ee17dfb, шаг 1, перенос:
  - `lib/generation/zh6/*` с банком;
  - нужные функции text-guard копией в `zh6/text.ts`: SLUZHEBNYE_TEGI, stripServiceTags, neXaY, finalNet поверх main. Общий text-guard не тронут;
  - в `simple.ts` ранний выход `if (activeHyps().has('zh6')) return zh6Write(ctx, req)`;
  - `hypotheses.ts`: Hyp 'zh6', регэксп `/^(h[1-8]|zh6?)$/`;
  - GenRequest: formatKod, rol, reakciya, samo;
  - settings: approach, blogAbout, snimaetVideo, matZvezdyVybor, kodovoeSlovo.
- ecea831: тестовые авторы G, H, I в `scripts/zh6/personas.ts`, eval-data как в main.
- a2796d0, шаг 3, текст:
  - PRIEMY.vsegda только у vterapii, uchebnik, termin, medsovet;
  - живые приемы идут на правку, только если у автора уже были (`bylo` из memory.zh6.priemy);
  - logikaMesta получил коды hudozhnik и istoriya_ty, род проверяется и в каруселях;
  - formaty.json: ход `carousel_istoriya_dialog`.
- d62b79c, шаг 2 внутри zh6:
  - formatGen оставляет post_tg и stories;
  - formatCodeOf отдает reels_scenka и reels_bez_slov;
  - vKadre и snimaetVideo: при «Пока без видео» нет talking_head и scene;
  - matZvezdy: сначала явный выбор, потом profanity «можно точечно», потом образцы;
  - kodMesta сверяет с booking и kodovoeSlovo;
  - chooseFormat6 берет код плана, только если `for[0]` равен типу;
  - schetOf = memory.total ?? count.
- 47c9ab1: zh6Popravit.
  - Это POPRAVIT_SYSTEM и popravitGuard: метки строк, ROLI_STROK, SMENY, мат автора, длина.
  - Если правка ломает разметку, `used=false`.
- 424b8ee, шаг 2 роуты и экраны (бэк и фронт через агентов):
  - memory.ts: zh6 и total;
  - new-pipeline: zh6On, zh6FieldsFrom, check_result.zh4, formatName;
  - group: body.zh6, цель zapis дает rol;
  - adjust: zh6Popravit, 422 unchanged, «Другой заход» через zh6Write;
  - новый GET `/api/generate-post/formaty`;
  - план тем: zh6PlanBatch, 3 пачки по 10, totalBatches;
  - событие make_start с format_kod, FEATURES format_pick;
  - миграция `20261110100000_zh6_profile.sql`, не применена;
  - экраны: ReelsScript, FormatPane, Composer, MakeFlow, content-plan, voice.
- 8054083, шаг 4, правки по ревью и дизайну. Подробно ниже.

### Правки шага 4 (по reviewer-psycont)
1. **«Другой заход» терял текст и не считался.** `adjust/route.ts`, ветка zh6:
   - вызов идет через `canConsume(user.id, 'generate_post', 1)`, при отказе 429 `{limit:true}`;
   - результат пишется в `check_result.zahod = {text, zh4}`, `content` не меняется, потом `commitConsume`;
   - выбор захода на экране шлет `action: 'zahod_pick'`. Сервер переносит `zahod.text` в content и `zahod.zh4` в `check_result.zh4`, сам zahod удаляет. Текст с экрана не доверяем;
   - прошлый показанный заход перед новым кладется в `ctx.memory.zh6` (primery, kon, ustr) и сдвигает total, поэтому следующий заход другой;
   - ACTION_CODE получил zahod_pick;
   - FormatPane: обработка 429 и fire-and-forget zahod_pick с мягкой ошибкой.
2. **Таймауты.** В `zh6/write.ts` константы `ZH6_DEADLINE_MS = 110000` и `ZH6_MIN_FIX_MS = 15000`:
   - в zh6Write правка мест получает `Math.min(60000, остаток)` или не стартует;
   - в zh6Plan так же устроена zh6PlanZamena (новый параметр timeoutMs);
   - samoShag (samo 'shag', по умолчанию выключен) остался на 60+60 с, в проде не включается.
3. **Реклама при zapis.** В `lib/generation/group.ts` добавлены:
   - `HARD_AD_RE`: цена, стоимость, скидка с числом, «успей», отзывы, «консультация стоит», «осталось N мест». Приглашения записаться и «напишите в директ» в нем нет;
   - функции `hardAdPhrases`, `stripHardAds`, `cleanHardAds`;
   - в new-pipeline при zh6 и zapis вызывается cleanHardAds вместо полного пропуска;
   - в group при zapis6 из фраз выкидываются только приглашения без жесткой рекламы, после переписи вызывается stripHardAds;
   - AD_RE, cleanAds и stripAds не тронуты.
4. **Экран голоса без флага.**
   - `formaty` отдает `zh6: true`, voice page по нему ставит zh6Ui;
   - поле кодового слова, переключатель звездочек, подпись варианта «Иногда» (без zh6 «Иногда, со звездочкой» как в main) и placeholder «Как к тебе попасть» зависят от zh6Ui;
   - сохранение kodovoe_slovo и проверка kodBad только при zh6Ui.
5. **Старый план тем.** noVideo убран из старого пути (там снова `=== 'не снимаю'`, как в main). zh6-ветка плана требует `isSimpleMode()`.
6. **Мелочи:**
   - `settings.kodovoeSlovo` от 2 до 40 знаков;
   - content-plan: `res.json().catch(() => null)` и ServerErrorNotice вместо сырой ошибки;
   - ситуация дня (tip у плана zh6) уходит параметром `sit`, MakeFlow добавляет ее к userDetail, пока в поле тема дня;
   - двойной импорт text-guard в new-pipeline сведен в один.

### Правки шага 4 (по designer-psycont и copywriter-psycont)
- **ReelsScript:**
  - вид bez_slov называется «Только надписи», подсказка от копирайтера;
  - плашки «Надпись N» без разделителя «дальше на экране»;
  - блок подсказок называется «Как снять»;
  - вторая и четвертая роль: `text-brand-text ml-3 pl-3 border-l-2`;
  - кнопка «Скопировать текст».
- **CaptionBlock** (общий с main): без uppercase и tracking, 13px, кнопка min-h-11.
- **FormatPane:**
  - копия без строк [смена];
  - тексты 422 и заходов от копирайтера (adjust/route.ts тоже).
- **Composer:**
  - строка вида стоит сразу под чипами, «Цель» ниже;
  - стрелка `w-11`;
  - строка «X тогда подберу сама. Вид пока выбирается для одного формата»;
  - подсказки «Только надписи», «Все роли играешь сама», «Пара абзацев, читается за минуту».
- **content-plan:** «Собрать карусель», рилс цветом accent, а не sage.

### Не сделано (записано)
- **Ревьюер:**
  - п.1: PROMPT_HYP общий на сервер. Нужна проверка NEW_GENERATION_PIPELINE=on, это шаг инструкции и вопрос 2;
  - п.5: лимит на «Поправить» и план, вопрос 3;
  - п.11: гонка habits, лечится миграцией, вопрос 6;
  - п.12: memory.ts проверяет только activeHyps zh6. Безвредно, память лишь читается;
  - п.13: звездочки при free без выбора, вопрос 4;
  - п.14: formatyCache на уровне модуля не сбрасывается при смене аккаунта во вкладке;
  - п.16-17: подписи KIND и кнопки дней плана поменялись и без флага. Безвредно, это тексты.
- **Дизайнер:**
  - п.13-15: fkod без имени при пустом каталоге, iOS-зум 14px на экране голоса (общая беда экрана);
  - выбор вида для нескольких форматов, вопрос 5.

### Проверка на экранах
- **Предпросмотр.**
  - `app/dev/zh6/page.tsx`: в production notFound;
  - `Preview.tsx`: настоящие Composer и FormatPane на данных `_знания/мозг-генератора/zh6/prod-check/rezultaty.json`;
  - запускался dev на 3015 с `.env.development.local` (фиктивный Supabase http://127.0.0.1:9, в .gitignore);
  - Playwright блокировал /api/ev и подменял /api/generate-post/formaty и /api/me.
- **Скриншоты** в `_знания/мозг-генератора/zh6/prod-check/`, ширина 390 и 1280.
- **Живая генерация скриптом (prod-check):**
  - план без ошибок смешения;
  - 7 видов сохранились с кодами reels_monolog, reels_scenka, reels_bez_slov, carousel, post, post_tg, stories;
  - «Поправить» на сценке взято;
  - zh+h7 отработал.
- **Вход в аккаунт не проверялся** (вопрос 1).

### Риски
- Первая живая проверка роутов будет на тестовом аккаунте. Скрипт гонял тот же код zh6, но не HTTP-роуты.
- «Другой заход» теперь списывает текст. У бесплатного с потолком 10 это заметно.
- cleanHardAds у zapis делает дополнительный вызов модели, только если нашлась жесткая реклама.
