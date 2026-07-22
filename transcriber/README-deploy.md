# PsyCont transcriber, деплой на 64.188.119.94

Маленький HTTP-сервис расшифровки голоса (faster-whisper, small, русский).
Живет на твоем сервере 64.188.119.94, отдельно от прода PsyCont. Порт 8090.
Соседей (matchmatch-bot на 8000, transkribator-bot) не трогаем.

Все команды ниже выполняются на сервере 64.188.119.94.

## 0. Что нужно на сервере

- Python 3.10+ и venv (`python3 --version`, `apt install python3-venv` если нет).
- Интернет для первой загрузки модели (small в формате CTranslate2, около 500 МБ на диск).
- ffmpeg по желанию: faster-whisper тянет декод через PyAV (свои ffmpeg-библиотеки внутри),
  системный ffmpeg обычно не обязателен. Если декод падает, поставь `apt install ffmpeg`.

## 1. Код и окружение

```bash
sudo mkdir -p /opt/psycont-transcriber
# Скопируй сюда содержимое папки transcriber/ из репозитория
# (app.py, requirements.txt, .env.example, psycont-transcriber.service).
# Через git (если репозиторий склонирован) или scp с локальной машины.

cd /opt/psycont-transcriber
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```

## 2. Токен

```bash
# Сгенерируй секрет:
openssl rand -hex 32
# Создай .env из примера и вставь токен:
cp .env.example .env
nano .env   # впиши WHISPER_SERVICE_TOKEN=<сгенерированный секрет>
chmod 600 .env
```

Этот же токен позже пропишешь на проде PsyCont как `WHISPER_SERVICE_TOKEN`. Не коммить `.env`.

## 3. Служба systemd

```bash
# Сначала убедись, что порт 8090 свободен (сосед matchmatch-bot на 8000, но проверь):
ss -ltnp | grep 8090 && echo "ЗАНЯТ, поменяй порт" || echo "8090 свободен"

sudo cp psycont-transcriber.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable psycont-transcriber
sudo systemctl start psycont-transcriber
# Первый старт грузит модель, это займет до пары минут:
sudo systemctl status psycont-transcriber --no-pager
journalctl -u psycont-transcriber -f   # смотреть логи, дождись «Модель загружена»
```

## 4. Firewall: пускать только прод PsyCont

Сервис слушает 0.0.0.0:8090, поэтому закрой порт на уровне ОС для всех, кроме прода
PsyCont (31.77.197.158). Иначе кто угодно из интернета шлет аудио и жжет твои 2 ядра.

Вариант ufw (если используешь ufw):
```bash
# ВНИМАНИЕ: если ufw еще не включен, сначала разреши SSH, иначе отрежешь себе доступ.
sudo ufw allow OpenSSH
sudo ufw allow from 31.77.197.158 to any port 8090 proto tcp
sudo ufw deny 8090
sudo ufw enable   # если был выключен; проверь что SSH-правило на месте
```

Вариант iptables (если ufw не используешь):
```bash
sudo iptables -A INPUT -p tcp --dport 8090 -s 31.77.197.158 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8090 -j DROP
# Сохрани правила (netfilter-persistent или iptables-save), иначе слетят при ребуте.
```

## 5. Проверка на самом сервере

```bash
# health без токена:
curl -s http://127.0.0.1:8090/health
# ожидаем: {"status":"ok","model":"small","ready":true}

# расшифровка с токеном (положи рядом короткий русский тестовый файл test.ogg/mp3/webm):
curl -s -X POST http://127.0.0.1:8090/transcribe \
  -H "Authorization: Bearer <твой_токен>" \
  -F "file=@test.ogg"
# ожидаем: {"text":"...распознанный русский текст..."}
```

Контракт ответа (важно для стороны PsyCont): при успехе всегда статус 200 и поле
`text`. Пустой `text` при 200 означает «речь не распозналась» (тишина, мусор, шум),
это НЕ ошибка сервиса, клиент должен обработать пустую строку как «не вышло, повтори».
Коды: 401 без/с кривым токеном, 413 файл больше лимита, 400 пустой файл,
504 таймаут расшифровки, 500 сбой декода/распознавания.

Замерь время на 30-секундном и на 2-3-минутном файле (`time curl ...`), пришли мне,
по ним поймем, укладывается ли latency и не нужен ли апгрейд подхода.

## 6. Если качество слабое

В `.env` смени `WHISPER_MODEL=medium`, потом `sudo systemctl restart psycont-transcriber`.
Medium точнее, но примерно втрое тяжелее по времени и памяти на 2 ядрах. Старт с small.

## 7. Безопасность канала (к запуску, важно)

Сейчас связь прод -> транскрибатор идет по http, то есть аудио и токен летят открыто.
Для теста 6.1 это допустимо (реальных данных психологов еще нет). До того, как в 6.2
поедет живой голос пользователей, канал надо зашифровать. Самый простой путь: поднять
перед сервисом Caddy с автоматическим Let's Encrypt на поддомен (например
voice.psycont.ru -> 64.188.119.94), тогда PsyCont ходит по https. Обсудим на 6.2.
Плюс к запуску: сервер заграничный, аудио уходит транзитом за рубеж, это отдельная
галочка в согласии и политике (аудио не хранится, только расшифровывается).

## 8. Полезное

```bash
sudo systemctl restart psycont-transcriber   # перезапуск после смены .env
journalctl -u psycont-transcriber -n 100 --no-pager   # последние логи
```
Логи пишут только размеры запроса и длину текста, содержимое расшифровки не логируется.
