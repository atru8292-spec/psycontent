// Сводные картинки образцов: по стилю одна JPG, строки это карусели, столбцы это слайды.
// npx tsx scripts/carousel-sheet.ts [папка_png] [папка_выхода]
// По умолчанию из _знания/мозг-генератора/test/karuseli/png в _знания/мозг-генератора/test/karuseli/
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const root = path.join(process.cwd(), '_знания', 'мозг-генератора', 'test', 'karuseli')
const src = process.argv[2] || path.join(root, 'png')
const out = process.argv[3] || root
const TW = 270, TH = 360, GAP = 12

async function main() {
  fs.mkdirSync(out, { recursive: true })
  for (const style of fs.readdirSync(src).filter(d => fs.statSync(path.join(src, d)).isDirectory())) {
    const files = fs.readdirSync(path.join(src, style)).filter(f => f.endsWith('.png'))
    const rows = [...new Set(files.map(f => f.replace(/-\d+\.png$/, '')))]
    const cols = Math.max(...rows.map(r => files.filter(f => f.startsWith(r + '-')).length))
    const sheet = sharp({ create: { width: cols * (TW + GAP) + GAP, height: rows.length * (TH + GAP) + GAP, channels: 3, background: '#d9d6d0' } })
    const parts: sharp.OverlayOptions[] = []
    for (let ri = 0; ri < rows.length; ri++) {
      const list = files.filter(f => f.startsWith(rows[ri] + '-')).sort((a, b) => Number(a.match(/-(\d+)\.png$/)![1]) - Number(b.match(/-(\d+)\.png$/)![1]))
      for (let ci = 0; ci < list.length; ci++) {
        const img = await sharp(path.join(src, style, list[ci])).resize(TW, TH, { fit: 'fill' }).toBuffer()
        parts.push({ input: img, left: GAP + ci * (TW + GAP), top: GAP + ri * (TH + GAP) })
      }
    }
    await sheet.composite(parts).jpeg({ quality: 82 }).toFile(path.join(out, `obrazcy-${style}.jpg`))
    console.log('ok', style)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
