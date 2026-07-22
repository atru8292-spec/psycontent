# PsyCont voice transcriber
# Маленький HTTP-сервис: принимает аудиофайл, возвращает русский текст.
# Живет на отдельном сервере (не на проде PsyCont), faster-whisper на CPU.
#
# Принципы:
# - Один воркер и очередь: транскрипции идут по одной (single-thread executor),
#   чтобы две разом не увели слабый сервер в swap. event loop свободен для /health.
# - 152-ФЗ: входящее аудио пишется во временный файл и удаляется сразу после
#   расшифровки (finally). Наружу отдаем только текст. Текст в логи не пишем.
# - Доступ закрыт Bearer-токеном. Без токена 401. Плюс firewall по IP на уровне ОС.

import os
import hmac
import asyncio
import logging
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from faster_whisper import WhisperModel

# ── Конфиг из окружения ──
TOKEN = os.environ.get("WHISPER_SERVICE_TOKEN", "").strip()
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "int8")
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "ru")
MAX_BYTES = int(os.environ.get("WHISPER_MAX_BYTES", str(25 * 1024 * 1024)))  # 25 МБ
TIMEOUT_SEC = int(os.environ.get("WHISPER_TIMEOUT_SEC", "300"))  # верхний порог на одну расшифровку

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("transcriber")

# Пул на одном потоке = транскрипции сериализованы автоматически.
executor = ThreadPoolExecutor(max_workers=1)
model: WhisperModel | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global model
    if not TOKEN:
        raise RuntimeError("WHISPER_SERVICE_TOKEN не задан, сервис не стартует без токена")
    cpu_threads = os.cpu_count() or 2
    log.info("Загружаю модель Whisper %s (%s), потоков CPU: %d", MODEL_SIZE, COMPUTE_TYPE, cpu_threads)
    model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE, cpu_threads=cpu_threads)
    log.info("Модель загружена, воркеров: 1")
    yield
    executor.shutdown(wait=False)


app = FastAPI(lifespan=lifespan)


def _check_token(authorization: str | None) -> None:
    # Сравнение на байтах в try: не-ASCII или кривой заголовок дает 401, а не 500.
    expected = f"Bearer {TOKEN}".encode("utf-8")
    ok = False
    if authorization:
        try:
            ok = hmac.compare_digest(authorization.encode("utf-8"), expected)
        except Exception:
            ok = False
    if not ok:
        raise HTTPException(status_code=401, detail="unauthorized")


def _transcribe_file(path: str) -> str:
    # Блокирующая транскрипция, крутится в single-thread executor (сериализовано).
    # vad_filter срезает тишину: быстрее и чище. Язык форсим, автодетект не тратим.
    assert model is not None
    segments, _info = model.transcribe(path, language=LANGUAGE, vad_filter=True)
    return " ".join(seg.text.strip() for seg in segments).strip()


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_SIZE, "ready": model is not None}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    _check_token(authorization)

    # Читаем по чанкам и обрываем на лимите, НЕ грузим весь запрос в память до проверки
    # (иначе гигантский файл уводит слабый сервер в OOM еще до проверки размера).
    data = bytearray()
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="file too large")
    size = len(data)
    if size == 0:
        raise HTTPException(status_code=400, detail="empty file")

    # Временный файл живет только на время расшифровки, потом удаляется (152-ФЗ).
    suffix = os.path.splitext(file.filename or "")[1][:8] or ".bin"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp_path = tmp.name
    try:
        tmp.write(data)
        tmp.close()
        loop = asyncio.get_running_loop()
        # Верхний порог на одну расшифровку: длинная запись не держит воркер вечно.
        # Примечание: поток whisper при таймауте досчитает в фоне (executor не прервать),
        # полноценную отмену обсудим в 6.2. Тут защита клиента от бесконечного ожидания.
        text = await asyncio.wait_for(
            loop.run_in_executor(executor, _transcribe_file, tmp_path),
            timeout=TIMEOUT_SEC,
        )
        # Логируем только размеры, НЕ содержимое (в тексте могут быть перс. данные).
        log.info("Готово: вход %d байт, текст %d символов", size, len(text))
        return {"text": text}
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        log.warning("Таймаут транскрипции (>%d сек), вход %d байт", TIMEOUT_SEC, size)
        raise HTTPException(status_code=504, detail="transcription timeout")
    except Exception:
        log.exception("Ошибка транскрипции")
        raise HTTPException(status_code=500, detail="transcription failed")
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
