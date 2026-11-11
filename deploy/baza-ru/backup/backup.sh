#!/bin/bash
# Ночной бэкап базы PsyCont (этап 7 переезда, 11.11.2026). На сервере базы: /opt/supabase/backup/backup.sh,
# запускает таймер systemd psycont-backup.timer каждый день в 03:30 по Москве (часовой пояс сервера Europe/Moscow).
# Что внутри одной копии (до шифрования):
#   db.dump        pg_dump -Fc всей базы postgres: public, auth, storage, служебные схемы
#   globals.sql    роли кластера (pg_dumpall --globals-only)
#   storage.tar.gz файлы storage (/opt/supabase/volumes/storage)
#   config.tar.gz  .env сервера, compose-оверрайд, Caddyfile, шаблоны писем: без того же JWT secret старые ключи сайта
#                  не подойдут к восстановленной базе
#   MANIFEST.txt   дата, версии, число строк в каждой таблице (для проверки восстановления)
# Копия шифруется age публичным ключом (age-public.txt). Ключ расшифровки только у Арины (_sekrety/backup-age-key.txt),
# на сервере его нет, поэтому прочитать копию на сервере нельзя. Хранятся последние KEEP копий.
# Если в backup.env заполнены S3_*, копия отправляется в S3 Selectel через rclone.
# При любой ошибке письмо на ALERT_TO через SMTP.bz (notify.py, доступы SMTP из /opt/supabase/.env).
set -Eeuo pipefail
umask 077

HERE=/opt/supabase/backup
# shellcheck disable=SC1091
source "$HERE/backup.env"
OUT=${BACKUP_DIR:-/var/backups/psycont}
KEEP=${KEEP:-7}
TS=$(date +%Y%m%d-%H%M)
WORK=$(mktemp -d "$OUT/.work-XXXXXX")
NAME="psycont-$TS.tar.age"
STEP="подготовка"

fail() {
  local code=$?
  echo "БЭКАП НЕ СДЕЛАН на шаге «$STEP» (код $code)" >&2
  rm -rf "$WORK"
  python3 "$HERE/notify.py" "Бэкап PsyCont не сделался" \
    "Ночной бэкап базы на сервере 141.133.187.249 упал на шаге «$STEP» (код $code), $(date '+%d.%m.%Y %H:%M') по Москве.
Журнал: sudo journalctl -u psycont-backup --since today
Ручной запуск: sudo systemctl start psycont-backup" || echo "и письмо не отправилось" >&2
  exit "$code"
}
trap fail ERR

STEP="дамп базы"
docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc -f /tmp/backup-db.dump
docker cp supabase-db:/tmp/backup-db.dump "$WORK/db.dump" >/dev/null
docker exec supabase-db rm -f /tmp/backup-db.dump
docker exec supabase-db pg_dumpall -U supabase_admin --globals-only > "$WORK/globals.sql"

STEP="проверка дампа"
# дамп должен читаться и содержать таблицы auth, storage и public
docker exec -i supabase-db pg_restore --list < "$WORK/db.dump" > "$WORK/list.txt"
for s in auth.users storage.objects public.generated_posts; do
  grep -q "TABLE DATA ${s%%.*} ${s#*.} " "$WORK/list.txt" || { echo "в дампе нет $s" >&2; false; }
done
rm -f "$WORK/list.txt"

STEP="опись строк"
{
  echo "PsyCont, бэкап $TS ($(date '+%d.%m.%Y %H:%M %Z'))"
  echo "Postgres: $(docker exec supabase-db psql -U supabase_admin -d postgres -Atc 'show server_version')"
  echo "Supabase self-hosted: $(cat /opt/supabase/.supabase-version 2>/dev/null || echo '?')"
  echo "--- строки по таблицам (схема.таблица|число)"
  docker exec -i supabase-db psql -U supabase_admin -d postgres -At -q < "$HERE/counts.sql"
} > "$WORK/MANIFEST.txt"

STEP="файлы storage"
tar -C /opt/supabase/volumes -czf "$WORK/storage.tar.gz" storage

STEP="настройки сервера"
tar -C /opt/supabase -czf "$WORK/config.tar.gz" .env docker-compose.psycont.yml caddy/Caddyfile email-templates .supabase-version

STEP="шифрование"
tar -C "$WORK" -cf - MANIFEST.txt db.dump globals.sql storage.tar.gz config.tar.gz \
  | age -R "$HERE/age-public.txt" -o "$OUT/$NAME.part"
mv "$OUT/$NAME.part" "$OUT/$NAME"
rm -rf "$WORK"
SIZE=$(du -h "$OUT/$NAME" | cut -f1)

STEP="старые копии"
ls -1t "$OUT"/psycont-*.tar.age 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
LEFT=$(ls -1 "$OUT"/psycont-*.tar.age | wc -l)

STEP="отправка в S3"
if [ -n "${S3_ACCESS_KEY:-}" ] && [ -n "${S3_SECRET_KEY:-}" ] && [ -n "${S3_BUCKET:-}" ] && [ -n "${S3_ENDPOINT:-}" ]; then
  RCLONE_CONFIG_SEL_TYPE=s3 RCLONE_CONFIG_SEL_PROVIDER=Selectel RCLONE_CONFIG_SEL_ENV_AUTH=false \
  RCLONE_CONFIG_SEL_ACCESS_KEY_ID="$S3_ACCESS_KEY" RCLONE_CONFIG_SEL_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  RCLONE_CONFIG_SEL_REGION="${S3_REGION:-ru-1}" RCLONE_CONFIG_SEL_ENDPOINT="$S3_ENDPOINT" \
    /usr/local/bin/rclone copyto "$OUT/$NAME" "sel:$S3_BUCKET/${S3_PREFIX:-psycont}/$NAME" --s3-no-check-bucket
  S3NOTE="отправлена в S3 Selectel ($S3_BUCKET)"
else
  S3NOTE="S3 не настроен (backup.env), копия только на сервере"
fi

echo "ГОТОВО: $NAME ($SIZE), на сервере копий: $LEFT, $S3NOTE"
