# -*- coding: utf-8 -*-
# zh13: перенос одобренных находок Инстаграма 19.11 в данные генератора (lib/generation/zh13/dannye.json, поле obrazcy,
# istochnik «insta-2026-11-19»). Решение Арины по каждой: NAHODKI-INSTA-RESHENIE-2026-11-19.md (75 в образцы).
# Текст образца: «Текст на экране», «Речь» (расшифровка с правками явных ошибок распознавания из zameny.json),
# «Подпись», если смысл в подписи. Призывы в конце вырезаются, эмодзи и хэштеги снимаются, длинная речь обрезается
# по концу фразы около 320 слов. kody: форматы zh13, которым находка служит образцом (раскладка ниже, по разбору
# RILSY-HUKI-FORMATY-2026-11-19.md); личные истории авторов только в формат «Своя история».
#   python3 scripts/zh13-insta.py <папка находок> <zameny.json или ->
import json, re, sys, os
P = sys.argv[1]
ZAM = json.load(open(sys.argv[2], encoding='utf-8')) if len(sys.argv) > 2 and sys.argv[2] != '-' and os.path.exists(sys.argv[2]) else []
a = json.load(open(os.path.join(P, 'NAHODKI-INSTA-2026-11-19.json'), encoding='utf-8'))
b = json.load(open(os.path.join(P, 'NAHODKI-INSTA-ZAHOD-4-2026-11-19.json'), encoding='utf-8'))
by = {x['id']: x for x in a + b}

# одобренные (решение Арины): заходы 1-3 все «бр» + DerS0B3Nqa-; заход 4 список
Z4 = 'DfhyRdCMwcV DY6rtyxI1_f Db3dSNfoIzS DeZYj6Uo7U- DfCtIARI-21 DaXKeeIsC73 DXvmw1VNCvU DXqha1NDOE3 DXgJlIhjDYl DbSQ-ghMj38 DeYiUd0O1jQ DcWNlahNG_Q DfEpa72gNlE De_MOavhHbt Df1TNG1hv-2 DeOz2yBMwiC DannHoWNCh6 Dds7I95M_rU De7V0v1EZwf DDr-QuDIVHy DcJIMK4sl3u Ddi4r3xvfjR DfMYLqlvf_h DeLvkXhCuWX Dfhc8BbqGAW DfpQ_v5qA3m Ddim9eaxFOc DX1ILvhIQWj DblF8-GoSKb DZcGOP1okMv DeI4OJEomfi DePOy85IhpG DfPrzYAI2tj'.split()
SEL = [x['id'] for x in a if x['status'] == 'бр'] + ['DerS0B3Nqa-'] + Z4
assert len(SEL) == 75 and len(set(SEL)) == 75

# разбор: длина, формат, хук (таблица 75 рилсов)
TAB = {}
for l in open(os.path.join(P, 'RILSY-HUKI-FORMATY-2026-11-19.md'), encoding='utf-8'):
    if l.startswith('| D'):
        c = [x.strip() for x in l.split('|')]
        TAB[c[1]] = {'dlina': int(re.sub(r'\D', '', c[4]) or 0), 'forma': c[5], 'huk': c[6], 'ton': c[8], 'mat': c[9]}

# форматы zh13 (formaty.ts): кому образец
KODY = {
    'pov_assoc': 'DU-m0nHDJLM DY5gjfeP7gp DWwmR3vjIb_ DW3xLT0jOA_',
    'pov_scenka': 'DTQIvtACOuP',
    'golos': 'Dfhc8BbqGAW DfpQ_v5qA3m DeYiUd0O1jQ',
    'vrednye': 'DaHv3XlIUce De_MOavhHbt Df1TNG1hv-2',
    'sebe20': 'DfAClj0x514',
    'slyshit': 'DDr-QuDIVHy',
    'dve_zhizni': 'DeLvkXhCuWX',
    'film_bez': 'Db3dSNfoIzS',
    'film_lico': 'DannHoWNCh6',
    'spor': 'DeHd34qtb44 DeOz2yBMwiC DfMYLqlvf_h DLUirjksVi5 DaXKeeIsC73 DcgUrx0A-BC',
    'pravila': 'DZszjNrN6XJ DWRT3nqjN4d DUlY5kgE7AH DcbkLIiIn5J DWCAD4bjHuL DeZYj6Uo7U- DePOy85IhpG DfPrzYAI2tj',
    'istoriya': 'DbsP9MwM5Wx DbV7iowMzWa DfEpa72gNlE',
    'scenka': 'DaDUvQytCJR DeRkA5koHrP DeZO4r8oIyu DZYGWifo6hO DXvmw1VNCvU DXqha1NDOE3 DXgJlIhjDYl DbSQ-ghMj38 DcJIMK4sl3u Ddim9eaxFOc DX1ILvhIQWj DblF8-GoSKb',
    'sessiya': 'Ddi4r3xvfjR',
    'ekran': 'DfPFEGVtWIs DKo33jgNaWb DerS0B3Nqa-',
    'mysl': 'Dbdb0Y3NWg5 DXyo2ZJMhUf DXZYnN4DGsi DX_5k67sdoQ DY5RZ1Ltw3T DYplsPeN0HS DYu1XT9NOSd De3cKpcyDaP DdEXOkpoqql DZInJgOO2BP DYkDndcsSvN DfhyRdCMwcV DY6rtyxI1_f DfCtIARI-21 DcWNlahNG_Q Dds7I95M_rU DZcGOP1okMv DeI4OJEomfi De7V0v1EZwf',
}
KOD_PO_ID = {}
for k, ids in KODY.items():
    for i in ids.split():
        KOD_PO_ID.setdefault(i, []).append(k)
# только идея или стиль, личные истории только «своя история»; карусели пока не трогаем (пишет zh6)
POMETKA = {'DC1pECJRfW4': 'видео чужое, берем только идею «что у нарцисса внутри»', 'DeTz917CGy5': 'только образец стилизации',
           'DbV7iowMzWa': 'своя история автора', 'DbsP9MwM5Wx': 'своя история автора', 'DfEpa72gNlE': 'своя история автора',
           'DY6rtyxI1_f': 'врач: только формат и мысль про контроль сна', 'DcWNlahNG_Q': 'не психолог, формат «кейс»',
           'DDr-QuDIVHy': 'подпись не образец', 'Df1TNG1hv-2': 'реклама профдиагностики вырезана', 'DUlY5kgE7AH': '«пиши +» вырезано'}

EMO = re.compile('[\U0001F000-\U0001FAFF☀-➿⬀-⯿️‍⠀-⣿]')
CTA = re.compile(r'(пиши(те)?\s*[«"]?\+|напиши(те)?\s+(мне\s+)?(в\s+)?(директ|личк|коммент)|запис\w*\s+(на|в)\s+\w+|в\s+директ|ссылк\w*\s+в\s+(шапке|профил|био)|подпиш\w+|сохран(и|яй)\w*\s+(себе|пост|видео)|диагностик|набор\s+в\s+групп|бесплатн\w+\s+(разбор|консультац|урок)|промокод|скидк|тариф|марафон|курс\b|гайд\s+(в|по)\s+ссылк|переход\w*\s+по\s+ссылк|ставь\w*\s+(лайк|\+)|чек.?лист|смотри(те)?\s+в\s+описани|приходите\s+ко\s+мне|ко\s+мне\s+на\s+\w+)', re.I)

def chist(t):
    t = EMO.sub('', t or '')
    t = re.sub(r'#\S+', '', t)
    t = t.replace('ё', 'е').replace('Ё', 'Е').replace('⠀', ' ')
    t = re.sub(r'\s+[—–]\s+', ', ', t).replace('—', '-').replace('–', '-')
    t = re.sub(r'[ \t]+', ' ', t)
    return re.sub(r'\n{3,}', '\n\n', t).strip()

def bez_cta(t):
    # призыв в конце: с первой фразы-призыва среди четырех последних фраз текста режем до конца
    fr = re.split(r'(?<=[.!?…])\s+', t.strip())
    for i in range(max(0, len(fr) - 4), len(fr)):
        if CTA.search(fr[i]):
            return ' '.join(fr[:i]).strip()
    return t.strip()

def obrezat(t, n=320):
    w = t.split()
    if len(w) <= n:
        return t
    s = ' '.join(w[:n])
    m = max(s.rfind('. '), s.rfind('? '), s.rfind('! '))
    return (s[:m + 1] if m > len(s) * 0.6 else s) + ' …'

out = []
zam_po = {}
for z in ZAM:
    zam_po.setdefault(z['id'], []).append(z)
for i in SEL:
    x = by[i]
    rech = x.get('rech') or ''
    for z in zam_po.get(i, []):
        if z['bylo'] in rech:
            rech = rech.replace(z['bylo'], z['stalo'], 1)
    t = TAB.get(i, {})
    kody = KOD_PO_ID.get(i, []) if x['format'] == 'рилс' else []
    if i in ('DC1pECJRfW4', 'DeTz917CGy5'):
        kody = []
    smysl_v_podpisi = any(k in kody for k in ('pov_assoc', 'pov_scenka', 'ekran', 'film_bez')) or not rech
    chasti = []
    if x.get('tekst_na_ekrane'):
        chasti.append('Текст на экране: ' + chist(x['tekst_na_ekrane']))
    if x.get('slaydy'):
        chasti.append(chist(x['slaydy']))
    if rech:
        chasti.append('Речь: ' + obrezat(bez_cta(chist(rech))))
    if smysl_v_podpisi and x.get('podpis') and i != 'DDr-QuDIVHy':
        chasti.append('Подпись: ' + obrezat(bez_cta(chist(x['podpis'])), 160))
    tekst = '\n'.join(c for c in chasti if c.strip())
    mat = (t.get('mat') or x.get('mat') or '').startswith('да')
    # автор называет метод или термины метода («когнитивное искажение», «психоаналитик»): в данных есть, в промпт не идет
    metod = bool(re.search(r'(КПТ(?!СР)|когнитив|гештальт|схема-терап|психоанализ|психоаналит|EMDR|ДПДГ|нарративн\w* терап|экзистенциальн\w* терап|арт-терап)', tekst, re.I))
    out.append({
        'id': 'insta:' + i, 'format': 'carousel' if x['format'] == 'карусель' else 'reels', 'podacha': t.get('forma') or x.get('podacha', ''),
        'kody': kody, 'huk': chist(t.get('huk', '')), 'ton': t.get('ton') or x.get('ton', ''), 'mat': mat, 'tema': x.get('tema', ''),
        'dlina': t.get('dlina') or None, 'avtor': x.get('avtor', ''), 'istochnik': 'insta-2026-11-19', 'metod': metod, 'pometka': POMETKA.get(i, ''), 'tekst': tekst,
    })

D = 'lib/generation/zh13/dannye.json'
d = json.load(open(D, encoding='utf-8'))
d['obrazcy'] = [o for o in d['obrazcy'] if not o['id'].startswith('insta:')] + out
json.dump(d, open(D, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('insta-образцов', len(out), '; с форматом', sum(1 for o in out if o['kody']), '; замен', sum(len(v) for v in zam_po.values()))
for k in KODY:
    print(' ', k, sum(1 for o in out if k in o['kody']))
