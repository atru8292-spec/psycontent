# -*- coding: utf-8 -*-
# zh13: страница оценки живого прогона (ZH13-PRAVKI-PROGON.html) из _знания/мозг-генератора/zh13-prod/rezultaty.json и
# do-posle.json. Все тексты целиком с форматом, у каждого «выложила бы / с правкой / нет» и заметка (в браузере),
# внизу «Скопировать оценки»; отдельный блок «до / после переписи». Телефон главный.
#   python3 scripts/zh13-stranica.py <выходной html> [zh14]   (zh14: прогон новых форматов, цель и хук, тест смеси)
import json, sys, html, os
ZH14 = len(sys.argv) > 2 and sys.argv[2] == 'zh14'
D0 = os.path.join(os.getcwd(), '_знания', 'мозг-генератора', 'zh13-prod')
D = os.path.join(D0, 'zh14') if ZH14 else D0
CEL = {'uznavanie': 'узнавание', 'polza': 'польза', 'spor': 'спор', 'doverie': 'доверие'}
HUK = {'spor': 'спорный тезис', 'esli': '«Если вы...»', 'vopros': 'вопрос', 'obeshchanie': 'обещание', 'replika': 'сразу реплика', 'istoriya': 'своя история', 'rubrika': 'рубрика', 'ekran': 'надпись', 'net': 'нет'}
R_ALL = json.load(open(os.path.join(D, 'rezultaty.json'), encoding='utf-8'))
R = [x for x in R_ALL if x.get('meta')]
VYBOR = [x for x in R_ALL if x.get('tolkoVybor')]
SMES = json.load(open(os.path.join(D0, 'smes-test.json'), encoding='utf-8')) if ZH14 and os.path.exists(os.path.join(D0, 'smes-test.json')) else []
DP = json.load(open(os.path.join(D, 'do-posle.json'), encoding='utf-8')) if os.path.exists(os.path.join(D, 'do-posle.json')) else []
e = lambda s: html.escape(str(s or ''))
VID = {'reels': 'Рилс', 'carousel': 'Карусель (рецепт zh6)', 'post': 'Пост'}
POM = {'anketa_geroya': 'анкета героя', 'sud_dokumenty': 'суд и документы', 'perevozhu': '«Перевожу» / «прилетает»', 'obryvki': 'обрывки подряд', 'telo': 'эмоция через тело', 'adresat': 'вопросы не человеку'}

def blok(t, body, cls=''):
    return f'<div class="b {cls}"><p class="bt">{t}</p>{body}</div>' if body else ''

karty = []
for i, x in enumerate(R):
    m = x['meta']
    shapka = f'<p class="f">{e(VID.get(x["vid"], x["vid"]))} · {e(x["imya"])}</p>'
    if ZH14: shapka += f'<p class="t">Цель: {e(CEL.get(m.get("cel"), m.get("cel")))} · хук: {e(HUK.get(m.get("hukVid"), m.get("hukVid")))}{" · подбор: " + e(m.get("vyborPochemu")) if x["key"].startswith("auto") else ""}{" · сцена: " + e(m.get("scena")) if m.get("scena") else ""}</p>'
    if ZH14 and m.get('rang'): shapka += '<p class="t">Ранжирование модели: ' + e(', '.join(r_['kod'] + ' (' + r_['pochemu'] + ')' for r_ in m['rang'])) + '</p>'
    pro = f'<p class="t">{"Своя мысль: " + e(m.get("mysl")) if m.get("mysl") else "Тема: " + e(m.get("tema"))}</p>'
    if m.get('situaciya'): pro += f'<p class="t">Ситуация: {e(m["situaciya"])}</p>'
    kak = ''.join(f'<li>{e(s)}</li>' for s in m.get('kakSnyat') or [])
    pod = ''.join(f'<li><b>{e(p.get("kod"))}</b>: {e(p.get("pochemu"))}</li>' for p in m.get('podoydet') or [])
    pom = ''.join(f'<li>{e(POM.get(p["kod"], p["kod"]))}: «{e(p["fraza"])}»</li>' for p in m.get('pometki') or [])
    per = ''.join(f'<li>{"взято" if p.get("vzyato") else "оставлено как было" + (" (" + e(p.get("pochemu")) + ")" if p.get("pochemu") else "")}: «{e(p["do"])}» → «{e(p.get("posle"))}»</li>' for p in m.get('perepis') or [])
    karty.append(f'''<article class="k" data-id="{i}">
{shapka}{pro}
<div class="txt">{e(x["glavnoe"])}</div>
{blok("Надпись на видео", e(m.get("nadpis")))}
{blok("Подпись", e(x.get("podpis")))}
{blok("Как снять", f"<ol>{kak}</ol>" if kak else "")}
{blok("Подойдет еще", f"<ul>{pod}</ul>" if pod else "")}
{blok("Пометки кодом", f"<ul>{pom}</ul>" if pom else "", "m")}
{blok("Перепись помеченного", f"<ul>{per}</ul>" if per else "", "m")}
<p class="pr">Проверка кодом: {e(", ".join(x.get("problemy") or []) or "проблем нет")} · {round(x.get("ms", 0) / 1000)} с</p>
<div class="oc"><button data-v="da">выложила бы</button><button data-v="pravka">с правкой</button><button data-v="net">нет</button></div>
<textarea placeholder="Заметка"></textarea>
</article>''')

dp = ''.join(f'''<div class="dp"><p class="f">{e(x.get("istochnik"))} · {e(POM.get(x.get("kod"), x.get("kod")))}{"" if x.get("vzyato") else " · оставлено как было" + (" (" + e(x.get("pochemu")) + ")" if x.get("pochemu") else "")}</p>
<p><span class="l">До:</span> {e(x.get("do"))}</p><p><span class="l">После:</span> {e(x.get("posle")) or "нет"}</p></div>''' for x in DP)

NOTE = '<p class="note">Рилсы R1 (без «как сказал бы вслух»), строка о понятности и 3-4 случайные пары «было / живо» под формат, «неудобные вопросы» к человеку, карусель рецептом zh6, пометки кодом и перепись только помеченной фразы. Тестовый психолог: КПТ и гештальт, тревога, отношения, работа, родители; аудитория «все», на «ты», без мата. Оценки хранятся в этом браузере.</p>'
if ZH14:
    NOTE = '<p class="note">Новые форматы по находкам Инстаграма 19.11 (по одному тексту, фильм в двух видах), один «Подбери сам» целиком: модель ранжирует форматы под тему, код берет первый, который держит смесь целей. Тестовый психолог: КПТ и гештальт, тревога, отношения, работа, родители; аудитория «все», на «ты», без мата. «Себе в 20 лет» написан из выдуманных для проверки фактов в «Своей мысли». Оценки хранятся в этом браузере.</p>'
smes_html = ''
if ZH14:
    rows = ''.join(f'<tr><td>{x["i"]}</td><td>{e(x["cel"])}</td><td>{e(x["imya"])}</td><td>{e(x["huk"])}</td><td>{e(x["tema"])}</td></tr>' for x in SMES)
    vyb = ''.join(f'<p>«Подбери сам» на тему «{e(x["tema"])}», только выбор: <b>{e(x["vybor"]["kod"])}</b> ({e(x["vybor"]["pochemu"])}). Ранжирование: {e(", ".join(r_["kod"] for r_ in x["rang"]))}</p>' for x in VYBOR)
    smes_html = f'<h2>Тест смеси: 20 подборов подряд</h2><p class="note">Без модели: ранжирование перемешано по теме, смесь и хуки считает код. На каждые 5 текстов 2 узнавание, 1 польза, 1 спор, 1 доверие; спорного тезиса нет на тяжелых темах.</p><div class="tw"><table><tr><th>№</th><th>Цель</th><th>Формат</th><th>Хук</th><th>Тема</th></tr>{rows}</table></div>{vyb}'
page = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{'zh14: новые форматы' if ZH14 else 'zh13: живой прогон'}</title><style>
:root{{--bg:#F5EFE4;--card:#fff;--t:#3B2A22;--m:#6B6458;--g:#33472B;--l:#EDE4F7;--br:#E3DACB}}
body{{margin:0;background:var(--bg);color:var(--t);font:16px/1.5 Onest,system-ui,sans-serif}}main{{max-width:720px;margin:0 auto;padding:16px}}
h1{{font-size:24px;margin:8px 0}}h2{{font-size:20px;margin:28px 0 8px}}.k,.dp{{background:var(--card);border:1px solid var(--br);border-radius:16px;padding:14px 16px;margin:14px 0}}
.f{{font-weight:600;margin:0}}.t{{color:var(--m);font-size:14px;margin:2px 0}}.txt{{white-space:pre-wrap;margin:12px 0;font-size:16px}}
.b{{background:#FBF8F2;border-radius:12px;padding:8px 12px;margin:8px 0;font-size:15px;white-space:pre-wrap}}.b.m{{background:var(--l)}}.bt{{font-weight:600;margin:0 0 4px;font-size:14px}}
.b ol,.b ul{{margin:0;padding-left:20px;white-space:normal}}.pr{{font-size:13px;color:var(--m)}}
.oc{{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}}.oc button{{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--br);background:#fff;color:var(--t);font:inherit;font-size:15px}}
.oc button.on{{background:var(--g);color:#fff;border-color:var(--g)}}textarea{{width:100%;box-sizing:border-box;min-height:64px;border:1px solid var(--br);border-radius:12px;padding:8px;font:inherit}}
.l{{font-weight:600}}#kop{{width:100%;min-height:52px;border-radius:14px;border:0;background:var(--g);color:#fff;font:inherit;font-weight:600;margin:20px 0}}
.tw{{overflow-x:auto}}table{{border-collapse:collapse;font-size:14px;width:100%}}td,th{{border-bottom:1px solid var(--br);padding:6px;text-align:left;vertical-align:top}}
.note{{background:var(--l);border-radius:12px;padding:10px 14px;font-size:14px}}
</style></head><body><main>
<h1>{'Новые форматы и подбор под тему' if ZH14 else 'zh13 после правок: живой прогон'}</h1>
{NOTE}
<h2>Тексты ({len(R)})</h2>
{"".join(karty)}
{smes_html}
<h2>До и после переписи</h2>
{dp or "<p>Переписей нет</p>"}
<button id="kop">Скопировать оценки</button>
</main><script>
const K='{'zh14-formaty' if ZH14 else 'zh13-pravki-progon'}';let s={{}};try{{s=JSON.parse(localStorage.getItem(K)||'{{}}')}}catch(e){{}}
const save=()=>{{try{{localStorage.setItem(K,JSON.stringify(s))}}catch(e){{}}}};
document.querySelectorAll('.k').forEach(k=>{{const id=k.dataset.id,f=k.querySelector('.f').textContent;s[id]=s[id]||{{f}};
 const bs=k.querySelectorAll('.oc button'),ta=k.querySelector('textarea');
 const paint=()=>bs.forEach(b=>b.classList.toggle('on',s[id].v===b.dataset.v));paint();ta.value=s[id].z||'';
 bs.forEach(b=>b.onclick=()=>{{s[id].v=s[id].v===b.dataset.v?null:b.dataset.v;paint();save()}});ta.oninput=()=>{{s[id].z=ta.value;save()}}}});
const NAZ={{da:'выложила бы',pravka:'с правкой',net:'нет'}};
document.getElementById('kop').onclick=()=>{{const t=Object.entries(s).map(([i,x])=>`${{+i+1}}. ${{x.f}}: ${{NAZ[x.v]||'без оценки'}}${{x.z?' · '+x.z:''}}`).join('\\n');
 navigator.clipboard.writeText(t).then(()=>{{document.getElementById('kop').textContent='Скопировано'}}).catch(()=>alert(t))}};
</script></body></html>'''
open(sys.argv[1], 'w', encoding='utf-8').write(page)
print('страница:', sys.argv[1], len(R), 'текстов,', len(DP), 'переписей')
