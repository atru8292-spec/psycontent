# Выкатка оплаты PsyCont (план, 17.11.2026)

Выкатываем одним заходом после ответа менеджера ЮKassa про автоплатежи без 3-D Secure (в тестовом магазине автоплатеж по карте требовал подтверждения от человека). Ветка `feat/oplata` стоит поверх `feat/zapusk-blok1` (блок 1 этапа 2 тоже еще не выкачен), поэтому выкатываются обе.

## Что нужно от Арины до выкатки

1. Ответ менеджера ЮKassa: автоплатежи без 3-D Secure включены в боевом магазине 1529145.
2. Боевые ключи в `~/Downloads/psycontent/_sekrety/yukassa-boevoy.env`: строки `YOOKASSA_SHOP_ID=1529145` и `YOOKASSA_SECRET_KEY=...` (секретный ключ из раздела «Интеграция» боевого магазина).
3. В личном кабинете боевого магазина, раздел «Интеграция», «HTTP-уведомления»: адрес `https://psycont.ru/api/pay/webhook`, события `payment.succeeded`, `payment.waiting_for_capture`, `payment.canceled`, `refund.succeeded`, `payment_method.active` (как в тестовом).
4. «Да» на выкатку в день выкатки.
5. Для живой проверки: «да» на одну настоящую оплату 1 290 ₽ своей картой и возврат ее же из /admin. ЮKassa не возвращает комиссию за возвращенный платеж (около 55 ₽ по карте, около 5 ₽ по СБП).
6. По желанию: ключи Яндекс SmartCaptcha в `_sekrety/smartcaptcha.env` (защита регистрации из блока 1 работает и без них, с ними надежнее).

## Шаги (делает Claude)

1. **Проверка перед слиянием.** `git fetch`, сверить `origin/main` (не ушел ли вперед). tsc без новых ошибок, все тесты (`test-oplata`, `test-pisma`, `test-safe-error`, `test-limit-texts`, `test-account-delete`, `test-signup-guard`, `test-rod-avtora`, `test-tarify`, `test-do-oplaty`, `test-limit-starye`, `test-analytics`, `test-zh6`, `test-generation`), сборка в отдельной копии. reviewer-psycont по всему диффу `main...feat/oplata` без блокеров.
2. **Копия базы.** На сервере базы (через сервер сайта, `ssh -A`) запустить `psycont-backup`, дождаться «ГОТОВО» в журнале, записать имя копии.
3. **Миграции по порядку** (через `docker exec supabase-db psql`, каждая в транзакции): `20261116100000_admin_traty_po_modeli.sql` (блок 1), `20261117100000_oplata.sql`. После: проверить колонки подписки, RLS и права новых таблиц, что `/api/health` ok.
4. **Сервер базы, блок 1:** правило Caddy против регистрации в обход сайта (`deploy/baza-ru/Caddyfile`, запись через `cat new > Caddyfile`, `caddy validate`, `caddy reload`). Проверить: `/auth/v1/signup` снаружи 404, с сервера сайта не 404.
5. **.env сайта.** Копия `.env` → `.env.pered-oplata`, `cmp`, права 600. Добавить: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` (боевые), `CRON_SECRET` (новый, 48 знаков), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (из `smtp.env`), `SMTP_FROM=PsyCont <noreply@psycont.ru>`, `SITE_PUBLIC_URL=https://psycont.ru`, ключи SmartCaptcha, если есть. НЕ ставить: `YOOKASSA_API_URL`, `BILLING_DRAFT_OK`, `PAY_MAIL_SUBJECT_PREFIX`. Тем же видом обновить `.env.ru-rabochiy`. Значения в чат не выводить.
6. **Код.** Слить `feat/zapusk-blok1`, затем `feat/oplata` в `main`, запушить, `bash /var/www/psycont/update.sh` (ставит nodemailer). После: сайт 200, `/api/health` ok, `pm2 status` (razbor-* как были), журнал без новых ошибок.
7. **Ротация журналов (блок 1):** `deploy/logrotate/psycont` в `/etc/logrotate.d/psycont`, `logrotate -d` без ошибок.
8. **Таймер оплаты.** `/etc/psycont-billing.header` одной строкой `X-Cron-Secret: <CRON_SECRET>`, права 600, root. `deploy/oplata/psycont-billing.service` и `.timer` в `/etc/systemd/system`, `systemctl daemon-reload`, `systemctl enable --now psycont-billing.timer`, ручной запуск `systemctl start psycont-billing`, в журнале JSON с `errors: 0`.
9. **Порт сайта.** Проверить, что `next start` psycont недоступен снаружи на 3001 (`ss -ltnp`, внешний curl). Если открыт: закрыть файрволом только порт 3001 или запускать psycont с `HOSTNAME=127.0.0.1` (pm2 только psycont). Иначе `X-Real-IP` можно подделать мимо nginx.
10. **Живая проверка** (после «да» на оплату): тестовый аккаунт atru8292+oplata, оплата 1 290 ₽ картой Арины с галочкой: экран итога, тариф в Профиле, письмо «оплата прошла», строка в /admin «нужен чек». Затем возврат из /admin: письмо о возврате, тариф выключен. Аккаунт удалить кнопкой в Профиле (проверка удаления с подпиской).
11. **Итог** в CLAUDE.md, раздел «Последняя передача дел».

## Откат

- Оплату выключить быстро: убрать `YOOKASSA_SECRET_KEY` из `.env` (или вернуть `.env.pered-oplata`), `pm2 restart psycont --update-env`: кнопки оплаты станут «оплату подключаю», вебхук ответит 503 (ЮKassa будет повторять сутки), продления не пойдут.
- Код: `git revert` слияния, `update.sh`. Миграции безопасно оставить: новые колонки и таблицы старый код не читает.
- Таймер: `systemctl disable --now psycont-billing.timer`.

## После выкатки (Арина)

- Чеки: раз в месяц до 9 числа выбить в «Мой налог» чеки по списку «нужен чек» в /admin/oplata и вставить ссылки (уходят людям письмом). После возврата там же отметка «аннулировать».
- Следить за письмами о сбоях: в журнале `pay mail: ... не ушло`, `renew: ... ручная проверка`, строки «проверить в ЮKassa» в /admin/oplata.
