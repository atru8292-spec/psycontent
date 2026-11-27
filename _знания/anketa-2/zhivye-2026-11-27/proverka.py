# -*- coding: utf-8 -*-
# Проверка строк агентов по правилам анкеты: тире, ё, род самого человека, «не X, а Y», длина, источник.
import json, os, re, sys
D = os.path.dirname(os.path.abspath(__file__))
ROD = re.compile(r'(?<![а-яё])(сама|сам|одна|один|устала|устал|должна|должен|готова|готов|рада|рад|виновата|виноват|уверена|уверен|согласна|согласен)(?![а-яё])', re.I)
# прошедшее время 2 лица без подлежащего: «сделала», «пришел» в начале фразы о самом человеке ловим грубо: глагол на -ла/-л без кавычек
PROSHL = re.compile(r'(?<![а-яё])[а-яё]{3,}(ла|лся|лась)(?![а-яё])', re.I)
NEXY = re.compile(r'(?<![а-яё])не (просто )?[а-яё ]{1,40}, а (?![а-яё]*\s*$)', re.I)
for f in 'PABCDE':
    p = f'{D}/{f}.json'
    if not os.path.exists(p): continue
    try:
        data = json.load(open(p, encoding='utf-8'))
    except Exception as ex:
        print(f, 'JSON сломан', ex); continue
    for t in data:
        for kind in ('situacii', 'vokrug'):
            for s in t.get(kind, []):
                x = s.get('tekst', '')
                bez_kavychek = re.sub(r'«[^»]*»', '', x)
                bad = []
                if '—' in x or '–' in x or ' - ' in x: bad.append('тире')
                if 'ё' in x or 'Ё' in x: bad.append('ё')
                if ROD.search(bez_kavychek): bad.append('род:' + ROD.search(bez_kavychek).group(0))
                if kind == 'situacii' and PROSHL.search(bez_kavychek): bad.append('прош:' + PROSHL.search(bez_kavychek).group(0))
                if NEXY.search(x): bad.append('не X, а Y')
                n = len(x.split())
                if n < 4 or n > 18: bad.append(f'слов {n}')
                if not str(s.get('istochnik', '')).startswith('https://'): bad.append('без источника')
                if bad:
                    print(f'{f} | {t["tema"]} | {kind} | {x} | {", ".join(bad)}')
