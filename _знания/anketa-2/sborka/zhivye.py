# -*- coding: utf-8 -*-
# Живые ситуации 27.11 (решение Арины): у 23 тем анкеты не было живых находок, ситуации были дописаны нами
# («0 · дописано»), и генератор раздувал их в притянутые сцены. Пять агентов собрали из живых рассказов
# (письма психологу и обсуждения читателей Т-Ж, Сноб, Мел, Пикабу, e1.ru) по 7-8 ситуаций на тему и фразы
# «что говорят вокруг», у каждой строки цитата и ссылка: _знания/anketa-2/zhivye-2026-11-27/{P,A-E}.json.
# Скрипт кладет их в ANKETA-DANNYE.json, lib/anketa/dannye.json и ANKETA-DANNYE.md: ситуации темы = только живые
# (только строки с дословной цитатой из рассказа; наши старые строки убраны: у «подтвердившихся» была одна ссылка без
# цитаты, и в отчете агента «пора бы уже» не подтвердилась, а в файле стояла как подтвержденная), фразы вокруг полем vokrug.
# Без вызовов модели, повторный запуск дает тот же результат.  python3 zhivye.py
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ANK = os.path.join(HERE, '..')
REPO = os.path.join(HERE, '..', '..', '..')
SRC = os.path.join(ANK, 'zhivye-2026-11-27')

def chk(s):
    s = s.strip()
    assert s and 'ё' not in s and 'Ё' not in s and '—' not in s and '–' not in s, s
    return s

def norm(s):
    return re.sub(r'[«»"\s]', '', s).lower()

zhivye = {}
for f in 'PABCDE':
    for t in json.load(open(os.path.join(SRC, f + '.json'), encoding='utf-8')):
        sit = [chk(x['tekst']) for x in t.get('situacii', [])]
        vok = [chk(x['tekst']) for x in t.get('vokrug', [])]
        urls = sorted({x.get('istochnik') for x in t.get('situacii', []) + t.get('vokrug', []) if str(x.get('istochnik', '')).startswith('https://')})
        uniq = []
        for x in sit:
            if norm(x) not in {norm(y) for y in uniq}:
                uniq.append(x)
        zhivye[norm(t['tema'])] = {'tema': t['tema'], 'situacii': uniq, 'vokrug': vok, 'istochniki': urls}

# Живые строки от Арины (27.11, комментарий к оценкам текстов): добавляются в тему как есть, с пометкой источника.
DOP = {
    'Страх чужого мнения и осуждения': ['попросить открыть окно в душном автобусе или сказать таксисту остановиться, и приходится себя перебарывать'],
}

def dopolnit(t, polnyy):
    for x in DOP.get(t['tema'], []):
        x = chk(x)
        if x not in t['situacii']:
            t['situacii'].append(x)
        if polnyy:
            ot = t.setdefault('ot_ariny', [])
            if x not in ot:
                ot.append(x)

def primenit(path, polnyy):
    d = json.load(open(path, encoding='utf-8'))
    nashli = set()
    for g in d['gruppy']:
        for t in g['temy']:
            dopolnit(t, polnyy)
            z = zhivye.get(norm(t['tema']))
            if not z:
                continue
            nashli.add(norm(t['tema']))
            t['situacii'] = z['situacii']
            t['vokrug'] = z['vokrug']
            if polnyy:
                t['istochniki'] = z['istochniki']
                t['zhivye'] = '2026-11-27'
                t.pop('net_nahodok', None)
                t.pop('dopisano', None)
    ne = set(zhivye) - nashli
    assert not ne, f'темы не нашлись в {path}: {ne}'
    if polnyy:
        d['zhivye'] = 'ситуации 23 тем без находок заменены живыми 27.11 (zhivye-2026-11-27, sborka/zhivye.py)'
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return len(nashli)

n1 = primenit(os.path.join(ANK, 'ANKETA-DANNYE.json'), True)
n2 = primenit(os.path.join(REPO, 'lib', 'anketa', 'dannye.json'), False)

# ANKETA-DANNYE.md: блок темы «**Тема** (0 · дописано)» и его строки «- ...» заменяем живыми
md_path = os.path.join(ANK, 'ANKETA-DANNYE.md')
L = open(md_path, encoding='utf-8').read().split('\n')
out, i, n3 = [], 0, 0
while i < len(L):
    m = re.match(r'^\*\*(.+?)\*\* \(', L[i])
    z = zhivye.get(norm(m.group(1))) if m else None
    if z:
        n3 += 1
        out.append(f'**{z["tema"]}** (живые 27.11 · источников {len(z["istochniki"])})')
        out += [f'- {x}' for x in z['situacii']]
        out += [f'- вокруг: {x}' for x in z['vokrug']]
        out.append('- источники: zhivye-2026-11-27')
        i += 1
        while i < len(L) and L[i].startswith('- '):
            i += 1
        continue
    out.append(L[i])
    i += 1
for tema, xs in DOP.items():
    for x in xs:
        if any(l == f'- {x} (Арина 27.11)' for l in out):
            continue
        for j, l in enumerate(out):
            if l.startswith(f'**{tema}**'):
                k = j + 1
                while k < len(out) and out[k].startswith('- ') and not out[k].startswith('- находки:'):
                    k += 1
                out.insert(k, f'- {x} (Арина 27.11)')
                break
txt = '\n'.join(out)
POMETKA = 'Пометка «живые 27.11»: у темы не было находок, ситуации и фразы «вокруг» собраны из живых рассказов людей 27.11, источники в zhivye-2026-11-27.'
if POMETKA not in txt:
    txt = txt.replace('В скобках у темы число находок.', 'В скобках у темы число находок. ' + POMETKA, 1)
open(md_path, 'w', encoding='utf-8').write(txt)
print('тем в ANKETA-DANNYE.json', n1, '| в lib/anketa/dannye.json', n2, '| в md', n3)
print('ситуаций', sum(len(z['situacii']) for z in zhivye.values()), '| вокруг', sum(len(z['vokrug']) for z in zhivye.values()))
