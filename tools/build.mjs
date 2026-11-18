// Bundles src/main.js (ES modules) into one IIFE and inlines it, with src/style.css,
// into src/shell.html. Writes:
//   index.html        - the complete page for GitHub Pages (open it straight in a browser too)
//   dist/game.html    - the artifact page content (no doctype/html/head/body: the host adds them)
//   dist/preview.html - the same content inside a skeleton like the host's, for local testing
import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = p => path.join(root, 'src', p)

const result = await build({
  entryPoints: [src('main.js')],
  bundle: true,
  format: 'iife',
  write: false,
  target: ['es2020'],
  minify: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
})
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
const css = await readFile(src('style.css'), 'utf8')
const shell = await readFile(src('shell.html'), 'utf8')
if (!shell.includes('{{STYLE}}') || !shell.includes('{{SCRIPT}}')) throw new Error('shell.html needs {{STYLE}} and {{SCRIPT}}')
const fill = s => s.replace('{{STYLE}}', () => css).replace('{{SCRIPT}}', () => js)
const page = fill(shell)

// The small reset the claude.ai host puts around an artifact. Every build gets it, so they all look alike.
const base = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}'
const skeletonHead = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${base}</style></head><body>`

// index.html: the shell's title, fonts and style go in <head>, the game in <body>.
// main.js switches <html lang> to the player's language when the game starts.
const at = shell.indexOf('<div id="app">')
if (at < 0) throw new Error('shell.html needs <div id="app">')
const pagesHead = fill(shell.slice(0, at))
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>\s*/, '')
  .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="Game puzzle berbentuk otak: putar jalur sketsa pensil supaya cat mengalir, bercampur, dan mewarnai setiap lingkaran pikiran.">')
// tab icon: a brain split down the middle, pencil folds on parchment and paint on plum
const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M32 5a27 27 0 0 0 0 54z' fill='%23efe5cf'/%3E%3Cpath d='M32 5a27 27 0 0 1 0 54z' fill='%234a0c38'/%3E%3Cpath d='M25 15c-7 2-11 9-9 16M17 40c3 6 8 9 15 9M26 26c-4 2-4 8 0 10' fill='none' stroke='%232b2620' stroke-width='2.6' stroke-linecap='round'/%3E%3Ccircle cx='42' cy='21' r='5.5' fill='%23ffc414'/%3E%3Ccircle cx='45' cy='37' r='6.5' fill='%23e51c7c'/%3E%3Ccircle cx='37' cy='49' r='4' fill='%23ff7a1a'/%3E%3Ccircle cx='32' cy='32' r='27' fill='none' stroke='%232b2620' stroke-width='3'/%3E%3C/svg%3E"
const index = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#24051e">
<link rel="icon" href="${icon}">
<style>${base}</style>
${pagesHead.trim()}
</head>
<body>
${fill(shell.slice(at)).trim()}
</body>
</html>
`

await mkdir(path.join(root, 'dist'), { recursive: true })
await writeFile(path.join(root, 'index.html'), index)
await writeFile(path.join(root, 'dist', 'game.html'), page)
await writeFile(path.join(root, 'dist', 'preview.html'), skeletonHead + page + '</body></html>')
const kb = n => (n / 1024).toFixed(1) + ' KB'
console.log(`built index.html (${kb(Buffer.byteLength(index))}) and dist/game.html (${kb(Buffer.byteLength(page))}), js ${kb(Buffer.byteLength(js))}, css ${kb(Buffer.byteLength(css))}`)
