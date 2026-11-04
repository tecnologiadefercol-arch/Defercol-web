/**
 * Imagen para redes (Open Graph, 1200×630) con la identidad del manual.
 *
 *   node scripts/marca/og.mjs
 *
 * Compone la pieza en HTML (fuentes y logo incrustados como data URI) y la
 * captura con Chrome sin interfaz. Salida: public/og-default.png.
 * Requiere Google Chrome y haber corrido antes scripts/marca/logos.mjs.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const data = (p, type) => `data:${type};base64,${fs.readFileSync(path.join(ROOT, p)).toString('base64')}`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face{font-family:Archivo;font-weight:900;font-stretch:118%;src:url(${data('public/fonts/archivo-900-118.woff2', 'font/woff2')}) format("woff2")}
@font-face{font-family:Barlow;font-weight:600;src:url(${data('public/fonts/barlow-600.woff2', 'font/woff2')}) format("woff2")}
@font-face{font-family:Barlow;font-weight:400;src:url(${data('public/fonts/barlow-400.woff2', 'font/woff2')}) format("woff2")}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{position:relative;background:#0e2548;color:#fff;font-family:Barlow,sans-serif;padding:72px 80px}
.logo{width:340px;display:block}
.dash{width:44px;height:5px;background:#d2232a;margin:66px 0 26px}
h1{font-family:Archivo,sans-serif;font-weight:900;font-stretch:118%;font-size:52px;line-height:1.08;letter-spacing:-.01em;max-width:820px}
.brands{margin-top:30px;font-weight:600;font-size:17px;letter-spacing:.24em;text-transform:uppercase;color:#a9b4c0}
.cut{position:absolute;right:0;bottom:0;width:430px;height:269px;
  background:linear-gradient(to top left,#163b6e calc(50% - 1px),rgba(211,217,224,.55) calc(50% - 1px),rgba(211,217,224,.55) calc(50% + 1px),transparent calc(50% + 1px))}
</style></head><body>
<img class="logo" src="${data('public/marca/logo-negativo-800.webp', 'image/webp')}" alt="">
<div class="dash"></div>
<h1>Racores, válvulas y accesorios para alta presión y temperatura.</h1>
<p class="brands">Swagelok · Valveco · Comfit · Ferreinstrumentos</p>
<div class="cut"></div>
</body></html>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-dafercol-'));
const file = path.join(tmp, 'og.html');
const shot = path.join(tmp, 'og.png');
fs.writeFileSync(file, html);
execFileSync(CHROME, [
  '--headless=new',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=1200,630',
  '--virtual-time-budget=3000',
  `--user-data-dir=${path.join(tmp, 'perfil')}`,
  `--screenshot=${shot}`,
  `file://${file}`,
], { stdio: 'ignore' });
const out = path.join(ROOT, 'public/og-default.png');
await sharp(shot).resize(1200, 630).png({ compressionLevel: 9, palette: true, quality: 95 }).toFile(out);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('public/og-default.png', (fs.statSync(out).size / 1024).toFixed(1), 'KB');
