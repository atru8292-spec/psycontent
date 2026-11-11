#!/bin/bash
# Сторож базы PsyCont (11.11.2026). На сервере базы: /opt/supabase/monitor/dbwatch.sh, запускает таймер
# psycont-dbwatch.timer каждые 2 минуты. Только смотрит и пишет письмо, ничего не перезапускает.
# Что проверяет:
#   - контейнеры Supabase запущены и здоровы (healthcheck);
#   - Postgres принимает подключения (pg_isready);
#   - db.psycont.ru отвечает через Caddy с этого же сервера (auth/v1/health с anon-ключом, ключ не печатается);
#   - свободная память и место на диске.
# Письмо (notify.py бэкапа, SMTP.bz, получатель ALERT_TO из backup.env) уходит после двух проверок подряд со сбоем
# (4 минуты, чтобы не будить из-за одной заминки), и еще одно, когда все вернулось, с длительностью сбоя.
# Если сервер базы выключен целиком, этот сторож молчит: про это письмо пришлет bootcheck.sh после загрузки.
set -uo pipefail
NOTIFY=/opt/supabase/backup/notify.py
STATE=/var/lib/psycont-dbwatch
mkdir -p "$STATE"
FAILS=$(cat "$STATE/fails" 2>/dev/null || echo 0)
SINCE=$(cat "$STATE/since" 2>/dev/null || echo "")
ALERTED=$(cat "$STATE/alerted" 2>/dev/null || echo 0)

problems=()
for c in supabase-db supabase-auth supabase-rest supabase-envoy supabase-caddy supabase-storage; do
  st=$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$c" 2>/dev/null) || st="нет контейнера"
  case "$st" in
    "running|healthy"|"running|-") ;;
    *) problems+=("контейнер $c: ${st/|/, }") ;;
  esac
done
docker exec supabase-db pg_isready -U postgres -h localhost -q 2>/dev/null || problems+=("Postgres не принимает подключения (pg_isready)")

ANON=$(grep -m1 "^ANON_KEY=" /opt/supabase/.env | cut -d= -f2-); ANON=${ANON//\"/}; ANON=${ANON//\'/}
code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve db.psycont.ru:443:127.0.0.1 -H "apikey: $ANON" https://db.psycont.ru/auth/v1/health 2>/dev/null)
unset ANON
[ "$code" = "200" ] || problems+=("db.psycont.ru через Caddy ответил ${code:-ничего} вместо 200")

avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
[ "${avail:-0}" -ge 250 ] || problems+=("мало свободной памяти: ${avail} МБ")
disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "${disk:-0}" -lt 90 ] || problems+=("диск занят на ${disk}%")

now=$(date '+%d.%m.%Y %H:%M')
if [ ${#problems[@]} -gt 0 ]; then
  FAILS=$((FAILS + 1))
  [ -n "$SINCE" ] || SINCE="$now"
  if [ "$FAILS" -ge 2 ] && [ "$ALERTED" != "1" ]; then
    body="Сторож базы на сервере 141.133.187.249 видит сбой с $SINCE по Москве (две проверки подряд):
$(printf -- '- %s\n' "${problems[@]}")
Сайт psycont.ru в это время может не пускать и не сохранять тексты.
Посмотреть: ssh psycont@141.133.187.249, sudo docker ps, sudo journalctl -u psycont-dbwatch --since today
Сторож ничего не перезапускает сам. Когда все вернется, придет второе письмо."
    python3 "$NOTIFY" "PsyCont: сбой базы" "$body" && ALERTED=1
  fi
  echo "сбой ($FAILS): ${problems[*]}"
else
  if [ "$ALERTED" = "1" ]; then
    python3 "$NOTIFY" "PsyCont: база снова работает" "Сторож базы: все проверки снова проходят, $now по Москве. Сбой начался $SINCE." || true
  fi
  FAILS=0; SINCE=""; ALERTED=0
  echo "ок: контейнеры, Postgres, db.psycont.ru 200, память ${avail} МБ, диск ${disk}%"
fi
echo "$FAILS" > "$STATE/fails"; echo "$SINCE" > "$STATE/since"; echo "$ALERTED" > "$STATE/alerted"
