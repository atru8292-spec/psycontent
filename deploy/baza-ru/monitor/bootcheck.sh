#!/bin/bash
# Письмо о перезагрузке сервера базы (11.11.2026). На сервере базы: /opt/supabase/monitor/bootcheck.sh, запускает
# psycont-bootcheck.service один раз при каждой загрузке. Ничего не перезапускает.
# Отличает штатное выключение (в журнале прошлой загрузки есть «systemd[1]: Reached target poweroff/reboot.target»)
# от обрыва (журнал просто кончается: жесткий сброс в панели хостинга, сбой хоста). Пишет, когда сервер пропал
# (последняя запись журнала) и когда загрузился, то есть сколько база была недоступна.
set -uo pipefail
NOTIFY=/opt/supabase/backup/notify.py
sleep 90   # дать подняться сети и контейнерам, чтобы письмо ушло и в нем было их состояние
last=$(journalctl -b -1 -q --no-pager -n 1 -o short-iso 2>/dev/null | cut -c1-19 | tr 'T' ' ')
boot=$(journalctl -b 0 -q --no-pager -o short-iso 2>/dev/null | head -1 | cut -c1-19 | tr 'T' ' ')
mins=""
if [ -n "$last" ] && [ -n "$boot" ]; then mins=$(( ($(date -d "$boot" +%s) - $(date -d "$last" +%s)) / 60 )); fi
if journalctl -b -1 -q --no-pager 2>/dev/null | grep -qE 'systemd\[1\]: Reached target (poweroff|reboot|halt)\.target'; then
  kind="штатно (выключение через систему или панель хостинга)"; subj="PsyCont: сервер базы перезагрузился"
else
  kind="БЕЗ штатного выключения: журнал просто оборвался (жесткий сброс в панели хостинга или сбой у хостинга)"; subj="PsyCont: сервер базы упал и поднялся"
fi
cont=$(docker ps --format '{{.Names}}: {{.Status}}' 2>/dev/null | sed 's/^/- /')
python3 "$NOTIFY" "$subj" "Сервер базы 141.133.187.249 перезагрузился $kind.
Последняя запись до перезагрузки: ${last:-неизвестно}, новая загрузка: ${boot:-неизвестно} (Москва)${mins:+, база была недоступна около $mins мин}.
Контейнеры сейчас:
${cont:-не удалось прочитать}
Журнал: ssh psycont@141.133.187.249, sudo journalctl -b -1 -n 50"
