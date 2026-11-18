import json, re, os
B = os.path.expanduser('~/Downloads/psycont-kontent-vhod-2026-11-18/')
KAT = json.load(open(B+'katalog/KATALOG-NAHODOK-2026-11-19.json'))
RAZ = {x['id']: x for x in json.load(open(B+'razmetka/RAZMETKA-ZHIVYH-2026-11-19.json'))}
_md = open(B+'razmetka/_iskhodnik-korpusa/RAZBOR-KARUSELEY-POLNYY.md').read()
_sek = re.split(r'\n(?=## )', _md)
def _kar10(kid):
    n = re.search(r'(\d{4})', kid).group(1)
    for s in _sek:
        head = '\n'.join(s.split('\n')[:3])
        if s.startswith('## ') and n in head and 'Итог' not in s[:12]:
            return s.strip()
    return ''
def tekst(kid):
    if kid in RAZ: return RAZ[kid].get('tekst') or ''
    if kid.startswith('kar10:'): return _kar10(kid)
    return ''
def godnost(kid):
    """можно ли брать в образцы: разметка zhivoy+obrazets; карусели октября kar10 без разметки допускаются"""
    r = RAZ.get(kid)
    if r: return bool(r.get('obrazets')) and r.get('kachestvo') == 'zhivoy'
    return kid.startswith('kar10:') and bool(_kar10(kid))
