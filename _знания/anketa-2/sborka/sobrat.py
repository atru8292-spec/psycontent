import json, re
from tekst import KAT
exec(open('gruppy.py').read()); exec(open('temy.py').read()); exec(open('frazy.py').read())
IMENA = {
 'А': ('a','Взрослый про себя','тревога, депрессия и апатия, самооценка, выгорание, психосоматика, еда и тело'),
 'Б': ('b','Отношения','пары, ревность, созависимость, травма и абьюз, секс и близость'),
 'В': ('v','Семья и дети','дети, подростки, родители, сепарация от родителей'),
 'Г': ('g','Работа и деньги','карьера, бизнес, деньги, прокрастинация, страх проявляться'),
 'Д': ('d','Горе и утрата','смерть близких, расставание, развод'),
 'Н': ('n','Нейропсихология','дети с трудностями развития и учебы, взрослые после травм и болезней мозга'),
 'О': ('o','Общие','эмоции, границы, вина, как идет терапия, знакомство с психологом'),
}
def chk(s):
    assert 'ё' not in s and 'Ё' not in s and '—' not in s and '–' not in s, s
    return s
gruppy=[]
for b,(kod,imya,podsk) in IMENA.items():
    temy=[]
    for t,idx,sit in T[b]:
        temy.append({'tema':chk(t),'nahodki':[KAT[i]['id'] for i in idx],'situacii':[chk(x) for x in sit],
                     **({'net_nahodok':True} if not idx else ({'malo_nahodok':True} if len(idx)<2 else {}))})
    fr=[{'fraza':chk(f),'nahodka':(KAT[i]['id'] if i is not None else None),**({'net_nahodok':True} if i is None else {})} for f,i in F[b]]
    gruppy.append({'kod':kod,'bukva':b,'imya':imya,'podskazka':podsk,'obshaya':b=='О','temy':temy,'frazy':fr,
                   'replika_klientki':REPLIKA[b]})
raskl={KAT[i]['id']:sorted(IMENA[x][0] for x in G[i]) for i in G}
data={'versiya':'2026-11-19','istochnik':'katalog/KATALOG-NAHODOK-2026-11-19.json, razmetka/RAZMETKA-ZHIVYH-2026-11-19.json, RAZBOR-KARUSELEY-POLNYY.md',
 'kto_prihodit':{'vozrast':['Дети','Подростки','18-25','25-45','45+'],'pol':['В основном женщины','В основном мужчины','Все'],'format':['Индивидуально','Пары','Семьи','Группы']},
 'pravila':{
   'temy_i_frazy':'Психолог видит темы и фразы отмеченных групп и общие (o).',
   'gruppa':'Группы выбираются только чипами направления на шаге 3. Детский психолог не видит тем работы и денег (g), бизнес-психолог не видит тем семьи и детей (v), пока сам не отметил обе группы.',
   'net_nahodok':'Темы с net_nahodok дописаны из знаний, живых находок на них нет.',
   'replika':'Реплика клиентки на шаге 6 берется по первой отмеченной группе.'},
 'gruppy':gruppy,'raskladka_nahodok':raskl}
json.dump(data,open('../ANKETA-DANNYE.json','w'),ensure_ascii=False,indent=1)
# читаемая копия
L=['# Данные анкеты психолога (19.11.2026)','','Собрано из каталога находок (271 находка) и их текстов. Темы с пометкой «нет находок» дописаны из знаний, живых текстов на них в каталоге нет. В скобках у темы число находок, из которых она собрана.','',
   '## Кто приходит (чипы)','',f"- Возраст: {', '.join(data['kto_prihodit']['vozrast'])}",f"- Пол: {', '.join(data['kto_prihodit']['pol'])}",f"- Формат: {', '.join(data['kto_prihodit']['format'])}",'',
   '## Правила','']+[f'- {v}' for v in data['pravila'].values()]+['']
for g in gruppy:
    L+=[f"## {g['bukva']}. {g['imya']}",'',f"Подсказка на чипе: {g['podskazka']}.",'',f"Реплика клиентки для шага 6: «{g['replika_klientki']}»",'','### Темы','']
    for t in g['temy']:
        m=' · нет находок' if t.get('net_nahodok') else ''
        L.append(f"**{t['tema']}** ({len(t['nahodki'])}{m})")
        L+= [f"- {s}" for s in t['situacii']]
        if t['nahodki']: L.append(f"- находки: {', '.join(t['nahodki'])}")
        L.append('')
    L+=['### Фразы клиентов','']
    for f in g['frazy']:
        L.append(f"- «{f['fraza']}»" + (f" ({f['nahodka']})" if f['nahodka'] else ' (нет находок, из знаний)'))
    L.append('')
open('../ANKETA-DANNYE.md','w').write('\n'.join(L))
print({g['bukva']:(len(g['temy']),len(g['frazy'])) for g in gruppy})
