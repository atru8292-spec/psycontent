# Сборка public/og.png из scripts/og/og.html: python3 scripts/og/build.py [куда сохранить]
# Нужен python-пакет playwright с Chromium. Сеть не нужна: шрифт и картинки берутся из public.
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'public' / 'og.png'

with sync_playwright() as p:
    br = p.chromium.launch()
    page = br.new_page(viewport={'width': 1200, 'height': 630})
    page.goto((root / 'scripts' / 'og' / 'og.html').as_uri())
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(300)
    page.screenshot(path=str(out))
    br.close()
print('готово:', out)
