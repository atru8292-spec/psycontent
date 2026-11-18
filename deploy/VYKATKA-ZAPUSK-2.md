# Выкатка release/zapusk-2 (план, 17.11.2026)

Что уезжает поверх прода (main 0e5aee7): аналитика 2 (опрос при уходе, недельное качество текстов, утренняя сводка; без «Оформления профиля»), новый кабинет (вариант А, ветка feat/kabinet-a сливается в release/zapusk-2), PWA и favicon, новые шаблоны писем входа. Новых миграций нет: таблицы аналитики 2 уже в базе, миграция оплаты применена 17.11.

Выкатываем только после «да» Арины. Оплата на проде остается в тестовом режиме (PAY_ONLY_EMAILS), боевые ключи отдельно после ответа ЮKassa.

## Шаги

1. **Проверка перед слиянием.** `git fetch`, origin/main не ушел вперед. tsc без новых ошибок, все scripts/test-*.ts, сборка в отдельной копии, reviewer-psycont по `git diff origin/main...release/zapusk-2` без блокеров.
2. **Копия базы.** На сервере базы (через сервер сайта, `ssh -A`): `sudo systemctl start psycont-backup`, дождаться «ГОТОВО», записать имя копии.
3. **Код.** Слить feat/kabinet-a в release/zapusk-2, release/zapusk-2 в main (перемотка, если origin/main не менялся), запушить, на сервере сайта `bash /var/www/psycont/update.sh`. После: сайт 200, `/api/health` ok, `pm2` (razbor-* как были), журнал без новых ошибок, `https://psycont.ru/manifest.webmanifest` 200 и иконки 192/512 отдаются, `/favicon.ico` 200.
4. **Шаблоны писем входа на сервере базы.** Новые `supabase/email-templates/confirmation.html` и `email_change.html` (без «мы»; пересобраны `node scripts/email-templates.mjs`). Тему письма подтверждения («Подтверди почту, и начнем», GOTRUE_MAILER_SUBJECTS_CONFIRMATION в docker-compose.psycont.yml) НЕ трогать.
   - Копия: `sudo cp -p /opt/supabase/email-templates/{confirmation,email_change}.html` в `*.pered-zapusk2`.
   - Новые файлы на сервер базы через сервер сайта (scp дважды), записать `cat new > /opt/supabase/email-templates/<файл>` (папка подключена в Caddy, поэтому inode не менять: только `cat >`, не cp и не mv), `cmp` с исходником из репо.
   - Проверка, что Caddy отдает новое: `sudo docker exec supabase-caddy wget -qO- http://localhost:8088/confirmation.html | grep -c "сразу соберу"` (1); так же сверить `email_change.html` с файлом из репо (`wget -qO- ... | cmp - <файл>`).
   - Gotrue подхватывает шаблон по адресу при отправке; если в течение 10 минут пробное письмо приходит старым, `docker compose restart auth` (это не перезапуск базы).
   - Пробное письмо: регистрация atru8292+shablon@gmail.com на сайте, проверить письмо подтверждения в почте Арины (только чтение), потом удалить тестовый аккаунт.
4а. **Бот поддержки (ветка feat/bot сливается в release/zapusk-2).**
   - Миграция `supabase/migrations/20261118100000_bot.sql` после копии базы (шаг 2): показать Арине, применить на сервере базы.
   - В `/var/www/psycont/.env` (копия и cmp до правки): TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, TELEGRAM_WEBHOOK_SECRET (новый, от 32 знаков), BOT_LINK_SECRET (новый, от 32 знаков), BOT_INCIDENTS=1. Перезапустить только psycont.
   - `npx tsx --env-file=.env scripts/tg-set-webhook.ts`, потом `--info` (вебхук https://psycont.ru/api/tg/webhook).
   - Таймеры из `deploy/bot/` (сводка 9:00 МСК, сигналы раз в 5 минут) по комментариям в файлах; проверить `systemd --version` (от 235).
   - Убрать cron старой сводки `scripts/digest.ts`, если стоит, иначе утром придут две сводки.
   - Проверка: Арина пишет боту с экрана «Помощь» тестового аккаунта и отвечает реплаем; `systemctl start psycont-bot-summary.service` присылает сводку; /svodka, /oshibki.
   - Проверить, что nginx ставит X-Real-IP на всех location (на нем держатся cron-роуты и проверка IP ЮKassa).
   - /privacy и /offer: правки по `_proverka/zapusk/bot/PRIVACY-BYLO-STALO.md` после «да» Арины, с DOCS_DATE и OFFER_VERSION.
5. **Проверка на проде** тестовым аккаунтом atru8292+...@gmail.com (служебный вход по ссылке): «Написать», «Мои тексты», «Настройки» с блоком «Тариф», «Помощь», «Темы» на 390 и 1440; обычный аккаунт видит «Оплата скоро». Тестовый аккаунт atru8292+oplata@gmail.com для ЮKassa не трогать.
6. **Итог** в CLAUDE.md, раздел «Последняя передача дел».

## Откат
- Код: `git revert` слияния и `update.sh`.
- Шаблоны писем: вернуть `*.pered-zapusk2` тем же `cat old > file`.
