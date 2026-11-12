# Переезд базы PsyCont в Россию

Итог переезда 10-11 ноября 2026. Секретов в этом файле нет: где они лежат, написано в разделе «Секреты».

## Что где стоит

| Что | Где |
|---|---|
| Сайт psycont.ru (Next.js) | сервер в Германии 31.77.197.158, папка `/var/www/psycont`, процесс pm2 `psycont`, порт 3001. Рядом Razbor: его не трогать, сервер не перезагружать |
| База, вход, файлы (Supabase) | сервер в Москве 141.133.187.249 (ISPserver, дата-центр IXcellerate), Ubuntu 24.04, 2 ядра, 4 ГБ, 40 ГБ NVMe. Адрес API: `https://db.psycont.ru` |
| Письма входа | SMTP.bz (Россия), отправитель `PsyCont <noreply@psycont.ru>`. Домен подтвержден, SPF, DKIM (`smtpbz._domainkey`), CNAME `stats`, DMARC (`p=none`) в reg.ru |
| DNS psycont.ru | reg.ru (ns1.reg.ru, ns2.reg.ru). Запись `db` типа A ведет на 141.133.187.249 |
| Облачная база (старая) | Supabase, проект psycontent, ref `gzzsrzxavteafapdntgu`, Ирландия. Не изменена, запасной вариант минимум до 25.11.2026. Сайт в нее больше не пишет |
| Расшифровка голоса (Whisper) | отдельный сервер, `WHISPER_SERVICE_URL` (подробности в отчете для политики конфиденциальности) |

Код переезда в main с `62db920` (ветка выкладки `feat/baza-ru-main`), рабочая ветка `feat/baza-ru`. Конфиги сервера базы без секретов лежат в `deploy/baza-ru/`.

## Сервер базы: как устроен

- Вход только по SSH-ключу (`~/.ssh/id_ed25519`), пользователь `psycont` с sudo без пароля. Вход по паролю и вход root закрыты.
- Брандмауэр ufw: открыты только 22, 80, 443. Docker умеет обходить ufw, поэтому:
  - порты Postgres (5432) и Studio (3000) привязаны только к 127.0.0.1;
  - служба `psycont-docker-guard` запрещает доступ с внешнего интерфейса к внутренним портам контейнеров.
- fail2ban следит за SSH. Часовой пояс Europe/Moscow. Swap-файл 2 ГБ плюс zram хостинга. Обновления безопасности ставятся сами (unattended-upgrades).
- Supabase: официальный self-hosted, релиз 0.8.4 (5.11.2026), Postgres 17.6, папка `/opt/supabase`.
  - Работают: база, auth, rest, storage, meta, Studio, шлюз Envoy и Caddy.
  - Выключены, потому что в коде не используются: realtime, edge functions, imgproxy, пулер. Выключение сделано в `docker-compose.psycont.yml` через `profiles: ["off"]`.
- Caddy:
  - отдает наружу только `/auth/v1/*`, `/rest/v1/*`, `/storage/v1/*`, все остальное получает 404;
  - сертификат Let's Encrypt продлевается сам;
  - передает в auth настоящий IP посетителя (`X-Real-IP`) для лимитов;
  - на порту 8088, только внутри сети Docker, отдает шаблоны писем.
- Вход и письма:
  - подтверждение почты включено, ссылки из писем живут 1 час;
  - одному человеку письмо не чаще раза в минуту, на весь сервер не больше 100 писем в час;
  - шаблоны писем лежат в `/opt/supabase/email-templates`, собираются из `scripts/email-templates.mjs`;
  - имя в письмах проверяет триггер базы `psycont_imya_guard`: только одно слово из букв, иначе письмо начинается с «Привет!».

## Секреты

- На сервере базы: `/opt/supabase/.env`, права 600. Внутри все ключи Supabase, пароль Postgres, пароль Studio и SMTP.bz.
- У тебя в `~/Downloads/psy-zh6-prod/_sekrety/` (папка в `.gitignore`):
  - `supabase-ru.env`: копия `/opt/supabase/.env`;
  - `env-dlya-germanii.txt`: три строки для `.env` сайта;
  - `backup-age-key.txt`: ключ расшифровки бэкапов. Его нет больше нигде, потеряешь, и бэкапы не прочитать. Сохрани копию в менеджере паролей;
  - `smtp.env`: SMTP.bz;
  - `supabase-cloud.env`: строка подключения к облаку. С сервера базы ее копия удалена.
- На сервере в Германии: `/var/www/psycont/.env`, рабочая копия `/var/www/psycont/.env.ru-rabochiy`.

## Как зайти

- На сервер базы: `ssh psycont@141.133.187.249`
- Studio (панель Supabase), только через туннель. На Mac в отдельном окне терминала:
  ```
  ssh -N -L 54323:127.0.0.1:3000 psycont@141.133.187.249
  ```
  Потом в браузере http://localhost:54323. Пока окно открыто, туннель работает. Снаружи Studio не видно.
- SQL к базе с сервера:
  ```
  docker exec -it supabase-db psql -U postgres -d postgres
  ```
  От `postgres`, как в облаке. Суперпользователь `supabase_admin` нужен только для служебных дел.
- Состояние сервисов: `cd /opt/supabase && docker compose ps`. Журнал входа: `docker logs --since 30m supabase-auth`.

## Сайт в Германии

- Supabase сайт берет только из трех строк `.env`: `NEXT_PUBLIC_SUPABASE_URL=https://db.psycont.ru`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Переменные с `NEXT_PUBLIC_` вшиваются при сборке, поэтому после их смены сайт нужно пересобрать.
- Обновление сайта: `bash /var/www/psycont/update.sh && pm2 restart psycont --update-env`. Скрипт берет `origin/main`, собирает и перезапускает только psycont.
- **Если `update.sh` упал на `next/font`** (ошибка про Google Fonts или `Onest` при сборке): это разовый сбой загрузки шрифта с Google. Ничего не чинить, просто запустить `update.sh` еще раз. Сайт при упавшей сборке остается на старой рабочей версии.
- Новый `.env` собран 11.11 из `.env.bak-oldkey` (копия от 20.10) плюс три строки новой базы. Проверь, что в нем есть все нужные переменные, команда в разделе «Хвосты».
- Журналы pm2 больше не содержат тексты людей и ответы модели: с 11.11 в журнал пишутся только длины, коды ошибок и внутренние номера пользователей.

## Бэкап

- **Когда:** каждый день в 03:30 по Москве, таймер systemd `psycont-backup.timer`. Если сервер был выключен в 03:30, бэкап сделается при включении.
- **Что в копии:** полный `pg_dump` базы (public, auth, storage и служебные схемы), роли кластера, архив файлов storage, настройки сервера (`.env`, оверрайд, Caddyfile, шаблоны писем) и опись с числом строк в каждой таблице.
- **Шифрование:** age. На сервере только публичный ключ (`/opt/supabase/backup/age-public.txt`), расшифровать можно только твоим `_sekrety/backup-age-key.txt`.
- **Где:** `/var/backups/psycont/psycont-ГГГГММДД-ЧЧММ.tar.age`, последние 7 копий. Копия весит около 0,7 МБ.
- **Если не сделался:** письмо на atru8292@gmail.com через SMTP.bz, с шагом, на котором упало. Пробное письмо отправлено 11.11.
- **Файлы:** `/opt/supabase/backup/` (backup.sh, notify.py, counts.sql, backup.env), исходники в `deploy/baza-ru/backup/`.
- **Вручную:**
  - сделать копию сейчас: `sudo systemctl start psycont-backup`;
  - посмотреть журнал: `sudo journalctl -u psycont-backup --since today`;
  - список копий: `sudo ls -la /var/backups/psycont`;
  - когда следующий запуск: `systemctl list-timers psycont-backup.timer`.

### Отправка в S3 Selectel (пока не настроена)

1. В панели Selectel: Объектное хранилище (S3), создать **приватный** бакет, например `psycont-backup`, в пуле ru-1. В настройках бакета включить адресацию Virtual-Hosted. Там же, в описании бакета или в разделе «Домены S3 API», взять домен S3 API пула, например `https://s3.ru-1.storage.selcloud.ru`.
2. Управление доступом: создать сервисного пользователя с ролью доступа к объектному хранилищу (S3) и выпустить ему **S3-ключ** (Access key и Secret key). Secret key показывается один раз.
3. На сервере базы заполнить `/opt/supabase/backup/backup.env`: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (`S3_REGION=ru-1` уже стоит):
   ```
   sudo nano /opt/supabase/backup/backup.env
   ```
4. Проверить: `sudo systemctl start psycont-backup && sudo journalctl -u psycont-backup -n 3 --no-pager`. В последней строке должно быть «отправлена в S3 Selectel».
5. В бакете стоит настроить правило жизненного цикла: удалять объекты старше 30 дней.

Отправка идет через rclone 1.76 (`/usr/local/bin/rclone`), Selectel требует версию не ниже 1.69. Копии уходят уже зашифрованными.

## Восстановление

**Проверка копии** (так и проверено 11.11: все 62 таблицы совпали строка в строку, 29 политик на месте). На Mac, из папки проекта:
```
ssh psycont@141.133.187.249 'sudo bash -c "umask 077; mkdir -p /root/restore-test && F=\$(ls -1t /var/backups/psycont/*.tar.age | head -1) && age -d -i - \$F | tar -x -C /root/restore-test && ls /root/restore-test"' < _sekrety/backup-age-key.txt
```
Ключ передается потоком и на диск сервера не попадает. Дальше на сервере:
```
sudo docker cp /root/restore-test/db.dump supabase-db:/tmp/rt.dump
sudo docker exec supabase-db createdb -U supabase_admin -O postgres restore_check
sudo docker exec supabase-db pg_restore -U supabase_admin -d restore_check /tmp/rt.dump
sudo docker exec -i supabase-db psql -U supabase_admin -d restore_check -At -q < /opt/supabase/backup/counts.sql
sudo cat /root/restore-test/MANIFEST.txt
```
Ожидаемые 2 ошибки `pg_restore` про `ensure_rls` нормальны. Этот event trigger в self-hosted создается только от роли `postgres`, см. ниже. После проверки уберешь за собой:
```
sudo docker exec supabase-db dropdb -U supabase_admin restore_check; sudo docker exec supabase-db rm -f /tmp/rt.dump; sudo rm -rf /root/restore-test
```

**Полное восстановление на новый сервер** не репетировалось, порядок такой:
1. Сервер как в разделе «Сервер базы».
2. Supabase той же версии: `self-hosted/v0.8.4` из github.com/supabase/supabase, папка `docker`, в `/opt/supabase`.
3. Из `config.tar.gz` в копии вернуть `.env`, `docker-compose.psycont.yml`, `caddy/Caddyfile`, `email-templates`. С тем же `.env` прежние ключи сайта подойдут, и `.env` сайта менять не придется.
4. Поднять только базу: `docker compose up -d db`.
5. Залить дамп поверх чистой базы: `docker exec -i supabase-db pg_restore -U supabase_admin -d postgres --clean --if-exists < db.dump`.
6. Создать event trigger от `postgres`:
   ```
   docker exec supabase-db psql -U postgres -d postgres -c "create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function public.rls_auto_enable()"
   ```
7. Поднять остальное: `docker compose up -d`. Вернуть файлы storage из `storage.tar.gz` в `/opt/supabase/volumes/`. Перенаправить A-запись `db` на новый IP.
8. Сверить строки (`counts.sql`) с `MANIFEST.txt`.

## Обновление Supabase

1. Сначала свежий бэкап: `sudo systemctl start psycont-backup`.
2. Прочитать `/opt/supabase/CHANGELOG.md` новой версии (там пишут про ломающие изменения).
3. Обновить:
   ```
   cd /opt/supabase && sh update.sh --dry-run && sh update.sh && sh run.sh pull && docker compose up -d
   ```
   Наш `docker-compose.psycont.yml` и `.env` остаются: `update.sh` их не трогает.
4. После обновления:
   - `docker compose ps`: все healthy;
   - `curl -s -o /dev/null -w "%{http_code}" https://db.psycont.ru/auth/v1/health` дает 401 (без ключа это нормально);
   - войти на сайт.
5. Если менялся Caddyfile: **`docker compose restart caddy`**. Caddy сам файл не перечитывает, а `docker compose up -d` контейнер не пересоздает, если изменился только файл.

## Откат на облако

Отката одной командой сейчас нет: копия `.env.oblako` 11.11 не сохранилась. Как вернуть такую возможность, написано в разделе «Хвосты». Учти: все, что люди сделают на новой базе после переключения, в облаке не окажется.

## Хвосты

1. СДЕЛАНО 11.11: `.env` сайта в Германии проверен, сайт работает на db.psycont.ru, вход и zh6 у etomath4 проверены. Осталось решить про старые копии `.env` рядом (у `.env.bak-oldkey` права 644), удаляет Арина.
2. Заполнить S3 Selectel для бэкапа (раздел «Бэкап»).
3. После 25.11.2026, если все работает: удалить облачный проект Supabase (сейчас он запасной, не трогать).
4. К запуску для реальных людей (из CLAUDE.md): spaCy для обезличивания, защита от ботов на регистрации.
5. Письмо о смене почты: экрана смены почты на сайте пока нет. Когда появится, проверить письмо на оба адреса.

## Грабли (все записаны в CLAUDE.md)

- Схему, залитую суперпользователем `supabase_admin`, догоняют его права по умолчанию: `anon` и `authenticated` получали доступ к закрытым функциям. После любой заливки схемы сверять права с облаком или эталоном.
- Event trigger на функцию обычной роли создается только от `postgres`.
- Сеть на Mac «открывает» любой порт, поэтому закрытые порты проверять на сервере (`ss`, `iptables`), а не с Mac.
- Caddy не перечитывает Caddyfile сам.
- gotrue вырезает HTML-комментарии из шаблонов писем. Срок ссылок одно число на все письма.
- В письма имя попадает только после проверки базы: клиенту верить нельзя.
- Команды, которые пишут файл через `>`, обнуляют его до того, как прочитают источник. Сначала проверять, что источник есть, и писать во временный файл.
