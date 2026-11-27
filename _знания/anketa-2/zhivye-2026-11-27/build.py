# -*- coding: utf-8 -*-
# Собирает страницу «Живые ситуации» из P/A/B/C/D/E.json (ответы агентов) для отметок Арины.
import json, html, os, re, sys
from urllib.parse import urlparse

D = os.path.dirname(os.path.abspath(__file__))
REPO = '/home/dev/workspaces/psycontent-git'
anketa = json.load(open(f'{REPO}/_знания/anketa-2/ANKETA-DANNYE.json', encoding='utf-8'))
gruppa_po_teme = {}
poryadok = []
for g in anketa['gruppy']:
    for t in g['temy']:
        gruppa_po_teme[t['tema']] = g['imya']
        poryadok.append(t['tema'])

def norm(s):
    return re.sub(r'[«»"\'\s]', '', s).lower()

temy = []
for f in 'PABCDE':
    p = f'{D}/{f}.json'
    if not os.path.exists(p):
        print('нет', p); continue
    for t in json.load(open(p, encoding='utf-8')):
        temy.append(t)

# порядок как в анкете
def mesto(t):
    n = norm(t['tema'])
    for i, x in enumerate(poryadok):
        if norm(x) == n: return i
    return 999
temy.sort(key=mesto)

def gruppa(t):
    n = norm(t['tema'])
    for k, v in gruppa_po_teme.items():
        if norm(k) == n: return v
    return ''

e = html.escape
def domen(u):
    try:
        h = urlparse(u).netloc.replace('www.', '')
        return h or 'источник'
    except Exception:
        return 'источник'

def ssylka(u):
    if not isinstance(u, str) or not u.startswith('https://'):
        return '<span class="src">без ссылки</span>'
    return f'<a class="src" href="{e(u)}" target="_blank" rel="noopener">{e(domen(u))}</a>'

vsego = 0
sekcii = []
nav = []
for i, t in enumerate(temy):
    tid = f't{i:02d}'
    nav.append(f'<a href="#{tid}">{e(t["tema"])}</a>')
    def spisok(items, pref):
        global vsego
        out = []
        for j, s in enumerate(items):
            rid = f'{tid}-{pref}{j}'
            vsego += 1
            q = s.get('citata') or ''
            qhtml = f'<p class="quote" hidden>«{e(q)}»</p>' if q else ''
            qbtn = '<button type="button" class="qbtn">цитата</button>' if q else ''
            out.append(
                f'<li class="row" data-id="{rid}" data-tema="{e(t["tema"])}" data-tekst="{e(s["tekst"])}">'
                f'<div class="body"><p class="txt">{e(s["tekst"])}</p>'
                f'<p class="meta">{ssylka(s.get("istochnik"))}{qbtn}</p>{qhtml}</div>'
                f'<button type="button" class="tog" aria-pressed="false">Убрать</button></li>')
        return '\n'.join(out)
    sit = spisok(t.get('situacii', []), 's')
    vok = spisok(t.get('vokrug', []), 'v')
    teper = []
    for s in t.get('teper', []):
        ok = 'подтвержд' in (s.get('verdikt') or '')
        teper.append(f'<li><span class="pill {"ok" if ok else "no"}">{"есть в живых" if ok else "не нашли"}</span> {e(s["tekst"])}</li>')
    sekcii.append(f'''
<section class="tema" id="{tid}">
  <p class="grp">{e(gruppa(t))}</p>
  <h2>{e(t["tema"])}</h2>
  <h3>Ситуации</h3>
  <ul class="list">{sit}</ul>
  {"<h3>Что говорят вокруг</h3><ul class='list'>" + vok + "</ul>" if vok else ""}
  {"<details class='old'><summary>Что было в знакомстве раньше</summary><ul>" + ''.join(teper) + "</ul></details>" if teper else ""}
  <label class="klabel" for="k-{tid}">Что поправить в этой теме</label>
  <textarea id="k-{tid}" class="kom" data-tema="{e(t["tema"])}" data-tid="{tid}" rows="2" placeholder="Например: третья строка про мужчин, а у меня клиентки"></textarea>
</section>''')

page = open(f'{D}/shablon.html', encoding='utf-8').read()
page = page.replace('{{NAV}}', ''.join(nav)).replace('{{SEKCII}}', '\n'.join(sekcii)).replace('{{VSEGO}}', str(vsego)).replace('{{TEM}}', str(len(temy)))
open(f'{D}/zhivye-situacii.html', 'w', encoding='utf-8').write(page)
print('тем', len(temy), 'строк', vsego)
