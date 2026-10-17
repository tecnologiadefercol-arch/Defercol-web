#!/usr/bin/env node
/**
 * Genera el catálogo PDF de Defercol a partir de los mismos datos del sitio.
 *
 *   npm run catalogo
 *
 * Salida:
 *   public/catalogo/catalogo-defercol.pdf   (lo descarga /catalogo)
 *   public/catalogo/portada.webp            (vista previa en /catalogo)
 *
 * Cómo funciona:
 *   1. Lee el árbol de categorías y marcas de src/data/site.ts y los productos
 *      de src/content/products/*.md.
 *   2. Prepara miniaturas cuadradas de 240 px en JPEG (≈ 200 ppp al tamaño
 *      impreso de 31 mm): es lo que mantiene el PDF liviano sin que se note.
 *      Chrome las incrusta tal cual (DCT), sin recomprimir.
 *   3. Pagina en milímetros (alturas fijas: cabecera de categoría, cabecera de
 *      subcategoría, filas de 2 tarjetas), así el índice sabe en qué página
 *      empieza cada sección antes de imprimir.
 *   4. Imprime el HTML con Chrome sin interfaz (texto vectorial, Inter
 *      incrustada solo con los caracteres usados, enlaces activos y marcadores
 *      de navegación: los h2/h3 de categoría y subcategoría forman el panel
 *      lateral del lector de PDF; por eso el resto de títulos no son encabezados).
 *
 * Requiere Google Chrome. Si no está en la ruta habitual, indica la ruta con
 * CHROME_PATH=/ruta/al/chrome npm run catalogo
 */
import { readFile, writeFile, mkdir, readdir, stat, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
import sharp from 'sharp';
import YAML from 'yaml';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = path.join(ROOT, 'scripts/catalogo');
const WORK = path.join(ROOT, 'node_modules/.cache/defercol-catalogo');
const THUMBS = path.join(WORK, 'thumbs');
const OUT_PDF = path.join(ROOT, 'public/catalogo/catalogo-defercol.pdf');
const OUT_COVER = path.join(ROOT, 'public/catalogo/portada.webp');
const THUMB_PX = 240; // 31 mm impresos ≈ 197 ppp
const THUMB_Q = 70;

// ---------------------------------------------------------------- datos ----
async function loadSite() {
  const src = await readFile(path.join(ROOT, 'src/data/site.ts'), 'utf8');
  const { code } = await transform(src, {
    loader: 'ts',
    format: 'esm',
    define: { 'import.meta.env': '{"PROD":false}' },
  });
  const tmp = path.join(WORK, 'site.mjs');
  await writeFile(tmp, code);
  return import(`${pathToFileURL(tmp).href}?t=${Date.now()}`);
}

async function loadProducts() {
  const dir = path.join(ROOT, 'src/content/products');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  const out = [];
  for (const f of files) {
    const raw = await readFile(path.join(dir, f), 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!m) continue;
    const d = YAML.parse(m[1]);
    out.push({ id: f.replace(/\.md$/, ''), ...d, specs: d.specs ?? [], order: d.order ?? 100, imageFit: d.imageFit ?? 'cover' });
  }
  return out;
}

// ------------------------------------------------------------ imágenes ----
async function thumb(p) {
  if (!p.image) return null;
  const src = path.join(ROOT, 'public', p.image);
  if (!existsSync(src)) return null;
  const s = await stat(src);
  const name = `${p.id}-${THUMB_PX}-${Math.round(s.mtimeMs)}-${p.imageFit}.jpg`;
  const dst = path.join(THUMBS, name);
  if (!existsSync(dst)) {
    const img = sharp(src).flatten({ background: '#ffffff' });
    const resized =
      p.imageFit === 'contain'
        ? img.resize(Math.round(THUMB_PX * 0.86), Math.round(THUMB_PX * 0.86), { fit: 'inside' })
        : img.resize(THUMB_PX, THUMB_PX, { fit: 'cover', position: 'attention' });
    const buf = await resized.toBuffer();
    // Lienzo cuadrado blanco centrado: todas las tarjetas miden igual.
    await sharp({ create: { width: THUMB_PX, height: THUMB_PX, channels: 3, background: '#ffffff' } })
      .composite([{ input: buf, gravity: 'center' }])
      .jpeg({ quality: THUMB_Q, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toFile(dst);
  }
  return `thumbs/${name}`;
}

// ------------------------------------------------------------- utilidades ----
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad2 = (n) => String(n).padStart(2, '0');

/** Hasta 2 datos técnicos útiles para la tarjeta, en orden de prioridad. */
function keySpecs(p) {
  const prio = [/presi[oó]n/i, /tama|medida/i, /material/i, /conexi/i, /temperatura/i, /rango|escala|voltaje/i, /sellos/i];
  const pool = p.specs.filter((s) => !/^referencias/i.test(s.label));
  const picked = [];
  for (const re of prio) {
    const s = pool.find((x) => re.test(x.label) && !picked.includes(x));
    if (s) picked.push(s);
    if (picked.length === 2) break;
  }
  return picked;
}

function refLine(p) {
  if (p.sku) return `Ref. ${p.sku}`;
  const r = p.specs.find((s) => /^referencias disponibles/i.test(s.label));
  if (r) return r.value.replace('números de parte', 'referencias');
  return '';
}

// ------------------------------------------------------------ paginación ----
// Alturas en mm (deben coincidir con el CSS).
const CONTENT_H = 252; // área útil entre cabecera y pie
const CAT_H = 50; // cabecera de categoría
const SUB_H = 12; // cabecera de subcategoría
const ROW_H = 40; // fila de tarjetas (38 mm + 2 mm de separación... el gap va dentro)

function paginate(categories, products) {
  const pages = []; // { type:'products', cat, blocks:[...] }
  const toc = []; // { cat, page, subs:[{sub, page, n}] }
  for (const [ci, cat] of categories.entries()) {
    const items = products.filter((p) => p.category === cat.slug);
    if (!items.length) continue;
    let page = { type: 'products', cat, ci, blocks: [], used: 0 };
    const newPage = () => {
      pages.push(page);
      page = { type: 'products', cat, ci, blocks: [], used: 0 };
    };
    page.blocks.push({ kind: 'cat', cat, ci, n: items.length });
    page.used += CAT_H;
    const entry = { cat, ci, firstIndex: pages.length, subs: [] };
    for (const sub of cat.subcategories) {
      const list = items
        .filter((p) => p.subcategory === sub.slug)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'es'));
      if (!list.length) continue;
      const rows = [];
      for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
      if (page.used + SUB_H + ROW_H > CONTENT_H) newPage();
      entry.subs.push({ sub, n: list.length, pageIndex: pages.length });
      page.blocks.push({ kind: 'sub', sub, n: list.length });
      page.used += SUB_H;
      for (const row of rows) {
        if (page.used + ROW_H > CONTENT_H) {
          newPage();
          page.blocks.push({ kind: 'sub', sub, n: list.length, cont: true });
          page.used += SUB_H;
        }
        page.blocks.push({ kind: 'row', row });
        page.used += ROW_H;
      }
    }
    pages.push(page);
    toc.push(entry);
  }
  return { pages, toc };
}

// ---------------------------------------------------------------- HTML ----
const LOGO = (size, dark = false) => `
<svg class="logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <rect width="64" height="64" rx="12" fill="${dark ? '#ffffff' : '#0b2545'}"/>
  <path d="M18 16h14c10 0 17 6.5 17 16s-7 16-17 16H18V16zm9 8v16h5c5 0 8.5-3.2 8.5-8S37 24 32 24h-5z" fill="${dark ? '#0b2545' : '#ffffff'}"/>
  <circle cx="47" cy="18" r="5" fill="#f2761b"/>
</svg>`;

function css() {
  const face = (w) =>
    `@font-face{font-family:Inter;font-weight:${w};font-style:normal;src:url("fonts/Inter-${w}.woff") format("woff")}`;
  return `
${[400, 500, 600, 700, 800].map(face).join('\n')}
@page { size: A4; margin: 0 }
:root{
  --navy:#0b2545; --navy-9:#071a33; --navy-7:#123563; --navy-1:#dbe6f6; --navy-05:#eef3fa;
  --orange:#f2761b; --orange-6:#b8520a; --orange-05:#fff4ea;
  --ink:#1b2430; --ink-2:#5b6776; --ink-3:#7b8794; --line:#dde3ea; --surface:#f4f6f9;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Inter,system-ui,sans-serif;color:var(--ink);font-size:8pt;line-height:1.35;
  font-feature-settings:"cv11","ss01","tnum" 0;-webkit-font-smoothing:antialiased;background:#8a94a3}
a{color:inherit;text-decoration:none}
.page{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
@media screen{ .page{margin:0 auto 6mm;box-shadow:0 2px 12px rgba(0,0,0,.25)} }

/* ---- cabecera y pie corridos ---- */
.run-head{position:absolute;left:14mm;right:14mm;top:9mm;height:8mm;display:flex;align-items:center;justify-content:space-between;
  border-bottom:.3mm solid var(--line);font-size:6.6pt;color:var(--ink-2);letter-spacing:.02em}
.run-head .brand{display:flex;align-items:center;gap:2mm;font-weight:700;color:var(--navy);letter-spacing:0}
.run-head .brand .logo{width:4.2mm;height:4.2mm}
.run-head .where{font-weight:600;color:var(--navy)}
.run-head .where span{color:var(--ink-3);font-weight:500}
.run-foot{position:absolute;left:14mm;right:14mm;bottom:8mm;height:6mm;display:flex;align-items:center;justify-content:space-between;
  font-size:6.4pt;color:var(--ink-3)}
.run-foot .pg{font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums}
.run-foot a{color:var(--ink-2)}
/* pestaña lateral: una posición por categoría para hojear el impreso */
.tab{position:absolute;right:0;width:6mm;height:22mm;border-radius:2mm 0 0 2mm;background:var(--navy);color:#fff;
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:7pt;writing-mode:vertical-rl}
.tab b{color:var(--orange)}

.content{position:absolute;left:14mm;right:14mm;top:22mm;height:${CONTENT_H}mm}

/* ---- cabecera de categoría ---- */
.cat{height:${CAT_H - 4}mm;margin-bottom:4mm;border-radius:4mm;background:linear-gradient(115deg,var(--navy-9) 0%,var(--navy) 55%,var(--navy-7) 100%);color:#fff;position:relative;overflow:hidden;
  padding:6mm 7mm;display:grid;grid-template-columns:auto 1fr;column-gap:6mm;align-content:start}
.cat::after{content:"";position:absolute;left:7mm;top:0;width:18mm;height:1.2mm;border-radius:0 0 1mm 1mm;background:var(--orange)}
.cat .num{font-size:30pt;font-weight:800;line-height:.9;color:var(--orange);letter-spacing:-.03em}
.cat h2{font-size:17pt;font-weight:800;letter-spacing:-.02em;line-height:1.05}
.cat p{margin-top:1.6mm;font-size:7.6pt;color:#c9d6ea;max-width:120mm}
.cat .count{margin-top:1mm;font-size:6.8pt;font-weight:600;color:#fff;opacity:.85}
.cat ul{grid-column:1 / -1;list-style:none;display:flex;flex-wrap:wrap;gap:1.4mm;margin-top:4mm;position:relative;z-index:1}
.cat li{font-size:6.4pt;font-weight:600;padding:.9mm 2.4mm;border-radius:10mm;background:rgba(255,255,255,.1);color:#e6edf7;white-space:nowrap}
.cat li span{color:var(--orange);margin-left:1mm}

/* ---- cabecera de subcategoría ---- */
.sub{height:${SUB_H}mm;display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:2.4mm;
  border-bottom:.35mm solid var(--navy);margin-bottom:0}
.sub .h{font-size:10.5pt;font-weight:700;color:var(--navy);letter-spacing:-.01em}
.sub .h i{font-style:normal;font-weight:500;color:var(--ink-3);font-size:7.4pt;margin-left:1.6mm}
.sub .n{font-size:6.6pt;font-weight:600;color:var(--orange-6);background:var(--orange-05);padding:.7mm 2.2mm;border-radius:10mm}

/* ---- tarjetas ---- */
.row{height:${ROW_H}mm;padding-top:2.5mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.card{height:${ROW_H - 3}mm;display:grid;grid-template-columns:31mm 1fr;gap:3.4mm;padding:2.6mm;border:.25mm solid var(--line);
  border-radius:3mm;background:#fff;overflow:hidden}
.card .img{width:31mm;height:31mm;border-radius:2mm;background:#fff;overflow:hidden;border:.2mm solid #eef1f5}
.card .img img{width:100%;height:100%;object-fit:cover;display:block}
.card .img.empty{background:var(--surface)}
.card .txt{display:flex;flex-direction:column;min-width:0;padding-top:.4mm}
.card .brand{font-size:5.6pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--orange-6)}
.card .ttl{margin-top:.5mm;font-size:8.2pt;font-weight:700;color:var(--navy);line-height:1.18;letter-spacing:-.005em;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .sum{margin-top:.8mm;font-size:6.6pt;color:var(--ink-2);line-height:1.3;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card dl{margin-top:auto;display:grid;grid-template-columns:auto 1fr;column-gap:1.6mm;row-gap:.2mm;font-size:6.1pt;line-height:1.3}
.card dt{color:var(--ink-3);white-space:nowrap}
.card dd{color:var(--ink);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .ref{margin-top:.9mm;font-size:6pt;font-weight:600;color:var(--navy-7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ---- portada ---- */
.cover{background:var(--navy-9);color:#fff}
.cover .photo{position:absolute;inset:0 0 auto 0;height:178mm;background-size:cover;background-position:50% 50%}
.cover .photo::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(7,26,51,.15) 0%,rgba(7,26,51,.55) 55%,#071a33 100%),
             linear-gradient(90deg,rgba(7,26,51,.65) 0%,rgba(7,26,51,0) 70%)}
.cover .top{position:absolute;left:16mm;right:16mm;top:16mm;display:flex;align-items:center;justify-content:space-between}
.cover .top .brand{display:flex;align-items:center;gap:3mm;font-size:15pt;font-weight:800;letter-spacing:-.02em}
.cover .top .brand .logo{width:10mm;height:10mm}
.cover .top .yr{font-size:7.5pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#c9d6ea}
.cover .title{position:absolute;left:16mm;right:16mm;top:120mm}
.cover .kicker{font-size:8pt;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--orange)}
.cover h1{margin-top:3mm;font-size:42pt;font-weight:800;line-height:.98;letter-spacing:-.035em}
.cover .lead{margin-top:5mm;font-size:10.5pt;line-height:1.45;color:#c9d6ea;max-width:140mm}
.cover .stats{position:absolute;left:16mm;right:16mm;top:192mm;display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.cover .stat{border-top:.4mm solid rgba(255,255,255,.18);padding-top:3mm}
.cover .stat b{display:block;font-size:22pt;font-weight:800;letter-spacing:-.03em}
.cover .stat span{font-size:7.4pt;color:#a9b9d1}
.cover .lines{position:absolute;left:16mm;right:16mm;top:224mm;display:grid;grid-template-columns:1fr 1fr;column-gap:8mm;row-gap:0;list-style:none}
.cover .lines li{display:flex;align-items:center;gap:3mm;padding:2mm 0;border-bottom:.25mm solid rgba(255,255,255,.1);font-size:8.4pt;font-weight:600}
.cover .lines li b{font-size:7pt;color:var(--orange);font-weight:800;width:5mm}
.cover .lines li span{margin-left:auto;font-size:7pt;color:#a9b9d1;font-weight:500}
.cover .foot{position:absolute;left:16mm;right:16mm;bottom:12mm;display:flex;justify-content:space-between;align-items:center;font-size:7.4pt;color:#a9b9d1}
.cover .foot .brands{display:flex;gap:4mm;font-weight:700;color:#e6edf7;letter-spacing:.02em}

/* ---- índice ---- */
.toc-h{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:6mm}
.toc-h h2{font-size:24pt;font-weight:800;color:var(--navy);letter-spacing:-.03em;line-height:1}
.toc-h p{font-size:7.6pt;color:var(--ink-2);max-width:78mm;text-align:right}
.toc{display:grid;grid-template-columns:1fr 1fr;column-gap:10mm}
.toc .c{margin-bottom:5mm;break-inside:avoid}
.toc .c > a{display:flex;align-items:baseline;gap:2.6mm;padding-bottom:1.6mm;border-bottom:.35mm solid var(--navy)}
.toc .c > a b{font-size:9pt;font-weight:800;color:var(--orange)}
.toc .c > a strong{font-size:10pt;font-weight:700;color:var(--navy);letter-spacing:-.01em}
.toc .c > a em{margin-left:auto;font-style:normal;font-weight:700;color:var(--navy);font-size:9pt;font-variant-numeric:tabular-nums}
.toc ul{list-style:none;margin-top:1mm}
.toc li a{display:flex;align-items:baseline;gap:1.6mm;padding:1.05mm 0;font-size:7.6pt;color:var(--ink)}
.toc li a::after{content:"";order:2;flex:1;border-bottom:.25mm dotted #c5cdd6;transform:translateY(-.6mm)}
.toc li a span{order:1}
.toc li a i{order:1;font-style:normal;color:var(--ink-3);font-size:6.6pt}
.toc li a em{order:3;font-style:normal;font-weight:600;color:var(--navy);font-variant-numeric:tabular-nums}
.how{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.how > div{border-radius:3mm;background:var(--navy-05);padding:4mm 4.5mm}
.how b{display:inline-grid;place-items:center;width:6mm;height:6mm;border-radius:50%;background:var(--navy);color:#fff;font-size:7pt;font-weight:800}
.how .t{margin-top:2mm;font-size:8.6pt;font-weight:700;color:var(--navy)}
.how p{margin-top:1mm;font-size:6.9pt;color:var(--ink-2)}
.brands-row{position:absolute;left:0;right:0;bottom:34mm;display:flex;align-items:center;gap:6mm;padding:4mm 0;border-top:.25mm solid var(--line);border-bottom:.25mm solid var(--line)}
.brands-row span{font-size:6.6pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.brands-row strong{font-size:9pt;font-weight:800;color:var(--navy);letter-spacing:-.01em}
.brands-row em{font-style:normal;font-size:6.6pt;color:var(--ink-3);margin-left:-4.4mm}

/* ---- contraportada ---- */
.back{background:var(--navy-9);color:#fff}
.back .inner{position:absolute;left:16mm;right:16mm;top:74mm;z-index:1}
.back h2{font-size:30pt;font-weight:800;line-height:1.02;letter-spacing:-.03em;max-width:150mm}
.back h2 span{color:var(--orange)}
.back p{margin-top:5mm;font-size:10pt;color:#c9d6ea;max-width:130mm;line-height:1.5}
.back .cta{display:inline-flex;align-items:center;gap:2.6mm;margin-top:9mm;padding:3.6mm 6mm;border-radius:20mm;background:#25d366;color:#06301a;font-weight:800;font-size:10pt}
.back .contact{margin-top:14mm;display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
.back .contact div{border-top:.4mm solid rgba(255,255,255,.18);padding-top:3mm}
.back .contact span{display:block;font-size:6.8pt;letter-spacing:.12em;text-transform:uppercase;color:#a9b9d1;font-weight:700}
.back .contact a,.back .contact b{display:block;margin-top:1.4mm;font-size:9.6pt;font-weight:700;color:#fff}
.back .legal{position:absolute;left:16mm;right:16mm;bottom:14mm;font-size:6.4pt;color:#8193ad;line-height:1.5}
.back{background:linear-gradient(160deg,#071a33 0%,#0b2545 60%,#123563 100%)}
.back::after{content:"";position:absolute;left:16mm;right:16mm;top:52mm;height:.4mm;background:linear-gradient(90deg,#f2761b 0 24mm,rgba(255,255,255,.12) 24mm)}
.back .logo-big{position:absolute;left:16mm;top:16mm;display:flex;align-items:center;gap:3mm;font-size:15pt;font-weight:800}
.back .logo-big .logo{width:10mm;height:10mm}
`;
}

function runHead(cat, sub) {
  return `<header class="run-head"><div class="brand">${LOGO(16)}Defercol<span style="font-weight:500;color:var(--ink-3);margin-left:1.4mm">Catálogo ${YEAR}</span></div>
  <div class="where">${esc(cat.name)}${sub ? ` <span>/ ${esc(sub)}</span>` : ''}</div></header>`;
}
function runFoot(n, total, siteUrl) {
  return `<footer class="run-foot"><a href="${esc(siteUrl)}/productos">${esc(siteUrl.replace(/^https?:\/\//, ''))}/productos</a>
  <span>Cotiza por WhatsApp con la referencia</span><span class="pg">${pad2(n)} <span style="color:var(--ink-3);font-weight:500">/ ${pad2(total)}</span></span></footer>`;
}
function tab(ci, nCats) {
  const top = 22 + ci * ((252 - 22) / Math.max(1, nCats - 1));
  return `<div class="tab" style="top:${top.toFixed(1)}mm"><span><b>${pad2(ci + 1)}</b></span></div>`;
}

function cardHtml(p, ctx) {
  const specs = keySpecs(p);
  const ref = refLine(p);
  const brand = ctx.brandName(p.brand);
  const url = `${ctx.site.url}/productos/${p.id}`;
  return `<a class="card" href="${esc(url)}">
    <div class="img${p.thumb ? '' : ' empty'}">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : ''}</div>
    <div class="txt">
      <span class="brand">${esc(brand)}</span>
      <div class="ttl">${esc(p.title)}</div>
      <p class="sum">${esc(p.summary)}</p>
      ${specs.length ? `<dl>${specs.map((s) => `<dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>`).join('')}</dl>` : '<dl></dl>'}
      ${ref ? `<div class="ref">${esc(ref)}</div>` : ''}
    </div></a>`;
}

let YEAR = new Date().getFullYear();

function buildHtml({ site, categories, brands, products, pages, toc, coverImg }) {
  const brandName = (s) => brands.find((b) => b.slug === s)?.name ?? s;
  const ctx = { site, brandName };
  const FRONT = 2; // portada + índice
  const total = FRONT + pages.length + 1;
  const pageNo = (i) => FRONT + i + 1;
  const siteHost = site.url.replace(/^https?:\/\//, '');
  const wa = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent('Hola Defercol, vi el catálogo PDF y quiero una cotización.')}`;
  const showContact = !site.__placeholder;
  // Con datos de plantilla, el botón lleva al formulario de contacto en vez de a un chat inexistente.
  const ctaHref = showContact ? wa : `${site.url}/contacto`;

  // Portada
  const counts = categories.map((c) => products.filter((p) => p.category === c.slug).length);
  const cover = `<section class="page cover">
    <div class="photo" style="background-image:url('${coverImg}')"></div>
    <div class="top"><div class="brand">${LOGO(40, true)}Defercol</div><div class="yr">Edición ${YEAR}</div></div>
    <div class="title"><div class="kicker">Catálogo de productos</div>
      <h1>Soluciones para<br>sistemas de fluidos.</h1>
      <p class="lead">${esc(site.tagline)}. Referencias de ${brands.map((b) => esc(b.name)).join(', ').replace(/, ([^,]*)$/, ' y $1')}, listas para cotizar.</p></div>
    <div class="stats">
      <div class="stat"><b>${products.length}</b><span>productos y familias</span></div>
      <div class="stat"><b>${categories.length}</b><span>líneas de producto</span></div>
      <div class="stat"><b>${brands.length}</b><span>marcas</span></div>
    </div>
    <ol class="lines">${categories
      .map((c, i) => `<li><b>${pad2(i + 1)}</b>${esc(c.name)}<span>${counts[i]}</span></li>`)
      .join('')}</ol>
    <div class="foot"><span>${esc(siteHost)}</span><span class="brands">${brands.map((b) => esc(b.name)).join('<span style="opacity:.35">·</span>')}</span></div>
  </section>`;

  // Índice
  const tocCol = (entries) =>
    entries
      .map(
        (e) => `<div class="c"><a href="#cat-${e.cat.slug}"><b>${pad2(e.ci + 1)}</b><strong>${esc(e.cat.name)}</strong><em>${pad2(pageNo(e.firstIndex))}</em></a>
      <ul>${e.subs
        .map((s) => `<li><a href="#sub-${e.cat.slug}-${s.sub.slug}"><span>${esc(s.sub.name)}</span><i>${s.n}</i><em>${pad2(pageNo(s.pageIndex))}</em></a></li>`)
        .join('')}</ul></div>`,
      )
      .join('');
  // Dos columnas equilibradas por número de líneas (cabecera de categoría ≈ 2 líneas).
  const weight = (e) => 2.4 + e.subs.length;
  const totalW = toc.reduce((n, e) => n + weight(e), 0);
  let acc = 0;
  let half = 0;
  while (half < toc.length && acc + weight(toc[half]) / 2 <= totalW / 2) acc += weight(toc[half++]);
  const index = `<section class="page">
    ${runHead({ name: 'Contenido' })}
    <div class="content">
      <div class="toc-h"><h2>Contenido</h2><p>Toca cualquier línea para ir a esa sección. Cada producto enlaza a su ficha en la web, con más detalles y referencias.</p></div>
      <div class="toc"><div>${tocCol(toc.slice(0, half))}</div><div>${tocCol(toc.slice(half))}</div></div>
      <div class="how">
        <div><b>1</b><div class="t">Encuentra el producto</div><p>Busca por línea y tipo en el índice o en las pestañas del borde.</p></div>
        <div><b>2</b><div class="t">Anota la referencia</div><p>Usa la referencia, la serie o el nombre de la familia.</p></div>
        <div><b>3</b><div class="t">Pide tu cotización</div><p>Escríbenos por WhatsApp con la referencia, la medida y la cantidad.</p></div>
      </div>
    </div>
    ${runFoot(2, total, site.url)}
  </section>`;

  // Páginas de producto
  const anchored = new Set();
  const body = pages
    .map((pg, i) => {
      let lastSub = '';
      const blocks = pg.blocks
        .map((b) => {
          if (b.kind === 'cat') {
            return `<div class="cat" id="cat-${b.cat.slug}"><div class="num">${pad2(b.ci + 1)}</div><div>
              <h2>${esc(b.cat.name)}</h2><p>${esc(b.cat.description)}</p><div class="count">${b.n} productos</div></div>
              <ul>${b.cat.subcategories
                .map((s) => {
                  const n = products.filter((p) => p.category === b.cat.slug && p.subcategory === s.slug).length;
                  return n ? `<li>${esc(s.name)}<span>${n}</span></li>` : '';
                })
                .join('')}</ul></div>`;
          }
          if (b.kind === 'sub') {
            lastSub ||= b.sub.name;
            const key = `${pg.cat.slug}-${b.sub.slug}`;
            const id = anchored.has(key) ? '' : ` id="sub-${key}"`;
            anchored.add(key);
            const tag = b.cont ? 'div' : 'h3';
            return `<div class="sub"${id}><${tag} class="h">${esc(b.sub.name)}${b.cont ? '<i>continuación</i>' : ''}</${tag}><span class="n">${b.n} ${b.n === 1 ? 'producto' : 'productos'}</span></div>`;
          }
          return `<div class="row">${b.row.map((p) => cardHtml(p, ctx)).join('')}</div>`;
        })
        .join('');
      return `<section class="page">${runHead(pg.cat, lastSub)}${tab(pg.ci, categories.length)}<div class="content">${blocks}</div>${runFoot(pageNo(i), total, site.url)}</section>`;
    })
    .join('\n');

  // Contraportada
  const contact = [
    ['Web', `<a href="${esc(site.url)}">${esc(siteHost)}</a>`],
    ['Correo', `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`],
    showContact ? ['WhatsApp', `<a href="${esc(wa)}">${esc(site.phone)}</a>`] : ['Horario', `<b>${esc(site.hours)}</b>`],
  ];
  const back = `<section class="page back">
    <div class="logo-big">${LOGO(40, true)}Defercol</div>
    <div class="inner">
      <h2>¿No encuentras tu referencia? <span>La conseguimos.</span></h2>
      <p>Este catálogo reúne nuestras líneas principales, pero manejamos muchas más referencias. Escríbenos con la medida, el material o una foto del producto y te asesoramos.</p>
      <a class="cta" href="${esc(ctaHref)}">Cotizar por WhatsApp →</a>
      <div class="contact">${contact.map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('')}</div>
    </div>
    <p class="legal">Imágenes de referencia. Especificaciones, disponibilidad y precios sujetos a confirmación al cotizar. ${brands
      .map((b) => esc(b.name))
      .join(', ')} y las demás marcas mencionadas pertenecen a sus respectivos dueños. Catálogo generado el ${new Date().toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })} · ${products.length} productos.</p>
  </section>`;

  const preview = `<script>
    // Vista previa: #p=N muestra solo la página N (para capturas de control de calidad).
    const m = location.hash.match(/p=(\\d+)/);
    if (m) { document.querySelectorAll('.page').forEach((el, i) => { if (i + 1 !== +m[1]) el.remove(); });
      document.body.style.background = '#fff'; document.querySelector('.page').style.margin = '0'; document.querySelector('.page').style.boxShadow = 'none'; }
  </script>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Catálogo Defercol ${YEAR}</title>
  <meta name="author" content="${esc(site.legalName)}"><meta name="description" content="Catálogo de productos Defercol ${YEAR}">
  <style>${css()}</style></head><body>${cover}${index}${body}${back}${preview}</body></html>`;
}

// --------------------------------------------------------------- Chrome ----
function chromePath() {
  const c = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  const hit = c.find((p) => existsSync(p));
  if (!hit) throw new Error('No encontré Google Chrome. Indica la ruta con CHROME_PATH=/ruta/al/chrome npm run catalogo');
  return hit;
}
const chromeBase = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'];

// ----------------------------------------------------------------- main ----
async function main() {
  const t0 = Date.now();
  await mkdir(THUMBS, { recursive: true });
  await rm(path.join(WORK, 'fonts'), { recursive: true, force: true });
  await mkdir(path.join(WORK, 'fonts'), { recursive: true });
  for (const f of await readdir(path.join(HERE, 'fonts'))) await copyFile(path.join(HERE, 'fonts', f), path.join(WORK, 'fonts', f));

  const mod = await loadSite();
  const { site, categories, brands, contactIsPlaceholder } = mod;
  site.__placeholder = contactIsPlaceholder;
  const products = (await loadProducts()).filter((p) => categories.some((c) => c.slug === p.category));
  console.log(`Productos: ${products.length}`);

  // Miniaturas (en paralelo, con caché por fecha de la imagen original)
  let done = 0;
  const queue = [...products];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const p = queue.shift();
        p.thumb = await thumb(p);
        if (++done % 100 === 0) console.log(`  miniaturas ${done}/${products.length}`);
      }
    }),
  );

  // Foto de portada
  const coverSrc = path.join(ROOT, 'src/assets/film/stop-1@2x.webp');
  const coverImg = 'cover.jpg';
  await sharp(coverSrc).resize(1400).jpeg({ quality: 70, mozjpeg: true }).toFile(path.join(WORK, coverImg));

  const { pages, toc } = paginate(categories, products);
  const html = buildHtml({ site, categories, brands, products, pages, toc, coverImg });
  const htmlPath = path.join(WORK, 'catalogo.html');
  await writeFile(htmlPath, html);
  const url = pathToFileURL(htmlPath).href;
  const chrome = chromePath();

  // PDF
  const tmpPdf = path.join(WORK, 'catalogo.pdf');
  await run(chrome, [...chromeBase, '--no-pdf-header-footer', '--generate-pdf-document-outline', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=30000', `--print-to-pdf=${tmpPdf}`, url], {
    maxBuffer: 1 << 26,
  });
  await mkdir(path.dirname(OUT_PDF), { recursive: true });
  await copyFile(tmpPdf, OUT_PDF);

  // Portada para la página /catalogo (A4 a 2x → 1240 px de ancho en WebP)
  const shot = path.join(WORK, 'portada.png');
  await run(chrome, [...chromeBase, '--window-size=794,1123', '--force-device-scale-factor=2', '--virtual-time-budget=10000', `--screenshot=${shot}`, `${url}#p=1`]);
  await sharp(shot).resize(1240, 1754, { fit: 'cover', position: 'top' }).webp({ quality: 80 }).toFile(OUT_COVER);

  const pdfSize = (await stat(OUT_PDF)).size;
  const totalPages = 2 + pages.length + 1;
  console.log(`\nListo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`  ${path.relative(ROOT, OUT_PDF)}  ${(pdfSize / 1048576).toFixed(2)} MB, ${totalPages} páginas`);
  console.log(`  ${path.relative(ROOT, OUT_COVER)}`);
  console.log(`  HTML de control: ${htmlPath}  (abre con #p=N para ver una página)`);
  if (contactIsPlaceholder) {
    console.warn('\n⚠ El WhatsApp, teléfono y dirección de site.ts siguen siendo de plantilla: el PDF muestra web, correo y horario.');
    console.warn('  Cuando estén los datos reales, vuelve a correr npm run catalogo.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
