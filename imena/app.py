# PsyCont: поиск имен людей в тексте перед отправкой в нейросеть (обезличивание, 152-ФЗ). 26.11.2026.
# Маленький HTTP-сервис рядом с сайтом: spaCy (NER, кто в тексте человек) + pymorphy3 (словарь имен, фамилий
# и отчеств OpenCorpora со всеми падежами и уменьшительными). Сайт (lib/imena-ner.ts) шлет текст, получает
# список словоформ, которые надо закрыть метками. Сама замена и обратная подстановка остаются в lib/anonymize.ts.
#
# Решение по слову (решения Арины 26.11):
#   - закрываем только то, что словарь знает как имя, фамилию или отчество: так ловятся клиенты с обычными
#     для России и СНГ именами (Снежана, Ярик, Тёма, Айгерим), а «Страх», «Слайд», «Колм», «Джокер» не трогаются;
#   - если слово бывает и обычным словом («Вера», «Любовь», «Роман», «Лев»), закрываем только когда spaCy
#     по смыслу фразы видит в этом месте человека;
#   - известные люди и герои фильмов (izvestnye.txt) не закрываются, нейросеть должна их узнавать; если в имени
#     человека есть известная фамилия или имя из списка, не трогаем все его слова («Лев Толстой»);
#   - род отдаем, только если spaCy и словарь согласны, иначе пусто (неверный род в метке хуже, чем никакого).
#
# 152-ФЗ: текст живет только в памяти запроса, в журнал не пишется (только длина и время).
# Доступ по Bearer-токену, слушает только 127.0.0.1 (systemd-файл рядом).

import os
import re
import hmac
import time
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

import json

from fastapi import FastAPI, HTTPException, Request

TOKEN = os.environ.get("IMENA_SERVICE_TOKEN", "").strip()
MODEL = os.environ.get("IMENA_MODEL", "ru_core_news_md")
MAX_CHARS = int(os.environ.get("IMENA_MAX_CHARS", "50000"))
# очередь меряем знаками в работе, а не числом запросов: десять коротких промптов проходят, два длинных нет.
# 40 тыс. знаков это около секунды на одном ядре; сверх этого 503 busy, сайт повторит или уйдет на правила
MAX_V_RABOTE = int(os.environ.get("IMENA_MAX_V_RABOTE", "40000"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("imena")

LICH = {"Name", "Surn", "Patr"}
WORD = re.compile(r"^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$")
HERE = Path(__file__).resolve().parent

executor = ThreadPoolExecutor(max_workers=1)
nlp = None
morph = None
ODNO: set[str] = set()          # одиночные слова: уникальные фамилии, герои, «не имена»
PARY: list[set[str]] = []       # пары: обычное имя или фамилия-слово только вместе («кристиан грей», «лев толстой»)
v_rabote = 0  # знаков в работе и в очереди


def load_izvestnye() -> tuple[set[str], list[set[str]]]:
    odno, pary = set(), []
    for line in (HERE / "izvestnye.txt").read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip().lower()
        if not line:
            continue
        words = line.split()
        if len(words) == 1:
            odno.add(words[0])
        else:
            pary.append(set(words))
    return odno, pary


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global nlp, morph, ODNO, PARY
    if not TOKEN:
        raise RuntimeError("IMENA_SERVICE_TOKEN не задан, сервис не стартует без токена")
    import spacy
    import pymorphy3
    spacy.util.fix_random_seed(0)
    log.info("Загружаю %s и словарь pymorphy3", MODEL)
    nlp = spacy.load(MODEL, exclude=["parser", "lemmatizer", "attribute_ruler"])
    morph = pymorphy3.MorphAnalyzer()
    ODNO, PARY = load_izvestnye()
    log.info("Готово: в списке известных %d слов и %d пар", len(ODNO), len(PARY))
    yield
    executor.shutdown(wait=False)


# служебные страницы FastAPI не нужны
app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def _token_ok(authorization: str | None) -> bool:
    expected = f"Bearer {TOKEN}".encode("utf-8")
    try:
        return authorization is not None and hmac.compare_digest(authorization.encode("utf-8"), expected)
    except Exception:
        return False


def _gender(tok, parse) -> str:
    g_sp = tok.morph.get("Gender")
    g_sp = g_sp[0].lower() if g_sp else ""
    g_mo = str(parse.tag.gender or "")
    sp = "f" if g_sp.startswith("fem") else ("m" if g_sp.startswith("mas") else "")
    mo = "f" if g_mo == "femn" else ("m" if g_mo == "masc" else "")
    return sp if sp and sp == mo else ""


def _formy(word: str) -> set[str]:
    return {word.lower()} | {p.normal_form for p in morph.parse(word)}


def najti(text: str) -> list[dict]:
    doc = nlp(text)
    per_tokens: set[int] = set()
    zashchishcheny: set[int] = set()
    for ent in doc.ents:
        if ent.label_ != "PER":
            continue
        per_tokens.update(t.i for t in ent)
        # известный человек: в имени есть одиночное слово из списка или обе части пары
        formy = [_formy(t.text) for t in ent]
        vse = set().union(*formy) if formy else set()
        if any(f & ODNO for f in formy) or any(p <= vse for p in PARY):
            zashchishcheny.update(t.i for t in ent)
    out, seen = [], set()
    for t in doc:
        if t.i in zashchishcheny or not WORD.match(t.text) or t.text in seen:
            continue
        ps = morph.parse(t.text)
        lp = [p for p in ps if LICH & p.tag.grammemes]
        if not lp or (_formy(t.text) & ODNO):
            continue
        dvusmysl = any(not (LICH & p.tag.grammemes) for p in ps)
        if dvusmysl and t.i not in per_tokens:
            continue
        seen.add(t.text)
        out.append({"t": t.text, "g": _gender(t, lp[0])})
    return out


@app.get("/health")
async def health():
    return {"ok": nlp is not None}


@app.post("/imena")
async def imena(request: Request):
    global v_rabote
    # токен и размер до чтения и разбора тела (ревью 26.11)
    if not _token_ok(request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        dlina = int(request.headers.get("content-length", "-1"))
    except ValueError:
        dlina = -1
    # fetch со строкой тела всегда ставит Content-Length; без него (chunked) отказ
    if dlina < 0 or dlina > MAX_CHARS * 4:
        raise HTTPException(status_code=413, detail="too_long")
    try:
        text = json.loads(await request.body()).get("text")
    except Exception:
        raise HTTPException(status_code=400, detail="bad_request")
    if not isinstance(text, str) or len(text) > MAX_CHARS:
        raise HTTPException(status_code=400, detail="bad_request")
    # проверка и учет подряд, без await между ними: иначе одновременные запросы проходят проверку все разом
    if v_rabote > 0 and v_rabote + len(text) > MAX_V_RABOTE:
        raise HTTPException(status_code=503, detail="busy")
    v_rabote += len(text)
    try:
        t0 = time.monotonic()
        res = await asyncio.get_running_loop().run_in_executor(executor, najti, text)
    finally:
        v_rabote -= len(text)
    log.info("imena: %d знаков, %d имен, %.0f мс", len(text), len(res), (time.monotonic() - t0) * 1000)
    return {"imena": res}
