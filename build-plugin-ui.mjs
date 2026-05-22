import { build } from 'esbuild'
import path from 'node:path'
import fs from 'node:fs'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const outdir = path.resolve(process.cwd(), 'dist')
if (!fs.existsSync(outdir)) fs.mkdirSync(outdir)

await build({
  entryPoints: ['plugin-ui.tsx'],
  bundle: true,
  outfile: 'dist/ui.js',
  alias: { '@': '.' },
  format: 'iife',
  platform: 'browser',
  target: ['es2017'],
  jsx: 'automatic',
  tsconfig: 'tsconfig.json',
  sourcemap: false,
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  external: [],
})

console.log('Built dist/ui.js')

// Also emit a standalone dist/ui.html with the JS bundle inlined
const distHtmlPath = path.resolve(process.cwd(), 'dist/ui.html')
let bundleForInline = fs.readFileSync(path.resolve(process.cwd(), 'dist/ui.js'), 'utf8')
// Ensure compatibility with older JS parsers: expand optional catch binding
bundleForInline = bundleForInline.replace(/catch\s*\{/g, 'catch(e) {')

// Build CSS using PostCSS + Tailwind and inline it
const cssSourcePath = fs.existsSync('styles/globals.css') ? 'styles/globals.css' : 'app/globals.css'
const rawCss = fs.readFileSync(cssSourcePath, 'utf8')
const cssResult = await postcss([tailwind()]).process(rawCss, { from: cssSourcePath })
let inlinedCss = cssResult.css
// Cheap compatibility fix: when Tailwind emits -webkit-line-clamp, also emit the standard property
inlinedCss = inlinedCss.replace(/-webkit-line-clamp:\s*(\d+)\s*;/g, (m, n) => `-webkit-line-clamp: ${n}; line-clamp: ${n};`)
// Remove vertical-align on block elements emitted by the reset to avoid warnings
inlinedCss = inlinedCss.replace(/img,\s*svg,\s*video,\s*canvas,\s*audio,\s*iframe,\s*embed,\s*object\s*\{[\s\S]*?\}/g, (block) => block.replace(/vertical-align:\s*middle;?/g, ''))
const distHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>String Translator</title>
    <style>html,body{height:100%;margin:0}#root{height:100%;padding:12px}</style>
    <style>${inlinedCss.replace(/<\//g, '<\\/')}</style>
  </head>
  <body>
    <div id="root">Loading…</div>
    <script>
      window.onerror = function(message){
        var el = document.getElementById('root');
        if (el) { el.textContent = 'Error: '+ message }
        try { parent.postMessage({ pluginMessage: { type: 'notify', message: 'UI error: '+ String(message) } }, '*') } catch (e) {}
      };
    </script>
    <script>\n${bundleForInline}\n</script>
  </body>
  </html>`
fs.writeFileSync(distHtmlPath, distHtml, 'utf8')
console.log('Wrote', path.relative(process.cwd(), distHtmlPath))

