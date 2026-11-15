#!/usr/bin/env bash
# Обновление боевого сайта PsyCont: bash /var/www/psycont/update.sh (копия этого файла лежит на сервере).
# С 15.11.2026 сборка идет в отдельную папку .next-novaya, а рабочий сайт до последней секунды отдает старую .next.
# Раньше сборка шла поверх .next работающего сайта, и пару минут картинки и куски страниц отдавали ошибки (502).
# Если сборка упала, сайт остается на старой версии. Предыдущая сборка хранится в .next-staraya.
# Откат только сборки: mv .next .next-bad && mv .next-staraya .next && pm2 restart psycont.
# Полный откат (если менялись конфиг, public или зависимости): git reset --hard <прошлый коммит>, потом этот скрипт без шага 1.
# Не заменять этот файл, пока он выполняется: bash читает скрипт по ходу работы.
# Razbor и другие процессы pm2 не трогает: перезапускается только psycont.
set -e
cd /var/www/psycont
echo "==> 1/5 Скачиваю свежий код с GitHub..."
git fetch origin
git reset --hard origin/main
echo "==> 2/5 Проверяю зависимости..."
npm install --no-fund --no-audit
echo "==> 3/5 Собираю в отдельную папку, рабочий сайт не трогаю..."
rm -rf .next-novaya
mkdir -p .next-novaya
if [ -d .next/cache ]; then cp -a .next/cache .next-novaya/cache; fi
NEXT_DIST_DIR=.next-novaya npm run build
[ -f .next-novaya/BUILD_ID ] || { echo "Сборка не дала BUILD_ID, сайт остается на старой версии"; exit 1; }
echo "==> 4/5 Меняю сборку и перезапускаю psycont (Razbor не трогаю)..."
# старую резервную сборку стираем, только если рабочая .next на месте (иначе это единственная рабочая сборка)
if [ -d .next ]; then
  rm -rf .next-staraya
  mv .next .next-staraya
fi
mv .next-novaya .next
# NEXT_DIST_DIR не должен попасть в процесс сайта: next start искал бы .next-novaya
env -u NEXT_DIST_DIR pm2 restart psycont --update-env
sleep 2
echo "==> 5/5 Проверка"
curl -s -o /dev/null -w "Проверка: psycont отвечает -> HTTP %{http_code}\n" http://localhost:3001
echo "Готово. Боевой сайт обновлен."
