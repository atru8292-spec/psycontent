# Служба imena: установка на сервер сайта

Зачем: перед отправкой текста в нейросеть найти имена людей (клиентов), которые не ловят правила lib/anonymize.ts
(«Вчера Снежана сказала», «сын Ярик», «Ева и Лев»). Известные люди и герои (izvestnye.txt) не закрываются.
Если служба не ответила, сайт работает на одних правилах и шлет сигнал в бот (lib/imena-ner.ts).

Ставится рядом с сайтом (31.77.197.158) так же, как служба голоса: без apt, Python и пакеты через uv внутри папки.
update.sh службу не трогает, файлы копируются руками. Перезапускать можно только эту службу.

1. Пользователь и папка: `useradd --system --no-create-home --shell /usr/sbin/nologin psycont-imena`,
   `install -d -o psycont-imena -g psycont-imena -m 750 /opt/psycont-imena`.
2. Файлы app.py, izvestnye.txt, requirements.txt из папки imena репо в /opt/psycont-imena (владелец psycont-imena).
3. Окружение: uv из /opt/psycont-transcriber/bin/uv (тот же 0.13.8), `uv venv --python 3.12 venv`,
   `uv pip install -r requirements.txt`.
4. Модель: скачать whl с github.com/explosion/spacy-models (release ru_core_news_md-3.8.0), сверить sha256 из
   requirements.txt, `uv pip install <файл>`. Модель в .env: IMENA_MODEL=ru_core_news_md (или lg после сравнения).
5. /opt/psycont-imena/.env (права 600, владелец psycont-imena): IMENA_SERVICE_TOKEN=<новый, 64 знака>,
   IMENA_MODEL=..., IMENA_THREADS=1.
6. `cp psycont-imena.service /etc/systemd/system/`, `systemctl daemon-reload`, `systemctl enable --now psycont-imena`.
   Проверка: `curl -s http://127.0.0.1:8091/health` -> {"ok":true}; `journalctl -u psycont-imena -n 20`.
7. Сайт: в /var/www/psycont/.env и .env.ru-rabochiy (копия и cmp до правки) IMENA_SERVICE_URL=http://127.0.0.1:8091
   и тот же IMENA_SERVICE_TOKEN, потом `pm2 restart psycont --update-env`.
8. Проверка запасного пути: `systemctl stop psycont-imena`, одна генерация проходит, в бот приходит
   «Служба имен не ответила», `systemctl start psycont-imena`.

В журнал службы пишется только длина текста, число найденных имен и время. Текст не пишется.

Защита от нагрузки: служба отвечает 503 busy, если в работе больше IMENA_MAX_V_RABOTE знаков (по умолчанию 40 тыс.), и 413 на
текст больше IMENA_MAX_CHARS (50 тыс. знаков); сайт сам не шлет тексты длиннее 40 тыс. знаков, после сбоя минуту
не зовет службу, сигнал в бот дает после трех сбоев подряд (lib/imena-ner.ts).
