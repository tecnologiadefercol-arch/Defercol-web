#!/usr/bin/env node
/**
 * Genera el catálogo PDF de DAFERCOL a partir de los mismos datos del sitio.
 *
 *   npm run catalogo
 *
 * Salida:
 *   public/catalogo/catalogo-dafercol.pdf   (lo descarga /catalogo)
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
 *   4. Imprime el HTML con Chrome sin interfaz (texto vectorial, fuentes
 *      incrustadas solo con los caracteres usados, enlaces activos y marcadores
 *      de navegación: los h2/h3 de categoría y subcategoría forman el panel
 *      lateral del lector de PDF; por eso el resto de títulos no son encabezados).
 *
 * Identidad: Manual de Marca DAFERCOL v1.0 (assets/marca/). Azul DAFERCOL para
 * títulos y textos principales, azul noche para portada, contraportada y bandas
 * de categoría, rojo manómetro solo en detalles (rayas cortas, números de
 * capítulo). Archivo 900 expandida (118 %) en titulares grandes y Barlow en todo
 * lo demás, las mismas fuentes del sitio (public/fonts/). Logo oficial a color
 * en la cabecera corrida y negativo sobre azul noche (public/marca/, generados
 * por scripts/marca/logos.mjs); nunca por debajo de 35 mm de ancho impreso.
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
const WORK = path.join(ROOT, 'node_modules/.cache/dafercol-catalogo');
const THUMBS = path.join(WORK, 'thumbs');
const OUT_PDF = path.join(ROOT, 'public/catalogo/catalogo-dafercol.pdf');
const OLD_PDF = path.join(ROOT, 'public/catalogo/catalogo-defercol.pdf'); // nombre anterior al manual de marca
const FONTS = path.join(ROOT, 'public/fonts');
const LOGOS = path.join(ROOT, 'public/marca');
const OUT_COVER = path.join(ROOT, 'public/catalogo/portada.webp');
const THUMB_PX = 240; // 31 mm impresos ≈ 197 ppp
const THUMB_Q = 70;

// ---------------------------------------------------------------- datos ----
async function loadSite() {
  const src = await readFile(path.join(ROOT, 'src/data/site.ts'), 'utf8');
  // Misma URL pública que el sitio (SITE_URL del entorno o de .env; ver astro.config.mjs):
  // de ella salen los enlaces de cada producto y la web de la contraportada.
  try {
    process.loadEnvFile(path.join(ROOT, '.env'));
  } catch {}
  const env = { PROD: false, ...(process.env.SITE_URL ? { SITE: process.env.SITE_URL } : {}) };
  const { code } = await transform(src, {
    loader: 'ts',
    format: 'esm',
    define: { 'import.meta.env': JSON.stringify(env) },
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
/**
 * Logo horizontal oficial (archivo del manual, sin redibujar). `ancho` en mm:
 * el manual pide al menos 35 mm impresos. Proporción del recorte: 4,309.
 */
const LOGO_RATIO = 4.309;
const LOGO = (ancho, negativo = false) =>
  `<img class="logo" src="logo-${negativo ? 'negativo' : 'color'}.png" alt="DAFERCOL" style="width:${ancho}mm;height:${(ancho / LOGO_RATIO).toFixed(2)}mm">`;
const CORTE = `<svg class="corte" viewBox="0 0 64 40" preserveAspectRatio="none" aria-hidden="true">
  <polygon points="64,0 64,40 0,40" fill="#163b6e"/>
  <line x1="0" y1="40" x2="64" y2="0" stroke="#d3d9e0" stroke-opacity=".6" stroke-width=".3"/></svg>`;

function css() {
  const barlow = (w) =>
    `@font-face{font-family:Barlow;font-weight:${w};font-style:normal;src:url("fonts/barlow-${w}.woff2") format("woff2")}`;
  return `
@font-face{font-family:Archivo;font-weight:900;font-stretch:118%;font-style:normal;src:url("fonts/archivo-900-118.woff2") format("woff2")}
${[400, 500, 600, 700].map(barlow).join('\n')}
@page { size: A4; margin: 0 }
:root{
  /* Manual de marca DAFERCOL, pág. 7 */
  --azul:#163b6e; --noche:#0e2548; --rojo:#d2232a;
  --acero-claro:#d3d9e0; --acero-medio:#9aa6b2; --acero-oscuro:#5f6e7e; --gris:#6b7a8b; --acero-neg:#a9b4c0;
  --azul-1:#e4eaf4; --azul-05:#f2f5fa;
  --ink:#1f2a37; --ink-2:#4c5a6a; --ink-3:#6b7a8b; --line:#e2e7ec; --surface:#f5f7f9;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Barlow,system-ui,sans-serif;color:var(--ink);font-size:8.2pt;line-height:1.35;
  font-kerning:normal;-webkit-font-smoothing:antialiased;background:#8a94a3}
a{color:inherit;text-decoration:none}
.display{font-family:Archivo,Barlow,sans-serif;font-weight:900;font-stretch:118%;font-synthesis:none}
.caps{text-transform:uppercase;letter-spacing:.2em;font-weight:600}
.logo{display:block}
.page{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
@media screen{ .page{margin:0 auto 6mm;box-shadow:0 2px 12px rgba(0,0,0,.25)} }

/* Corte diagonal en azul DAFERCOL con filo de acero (tarjeta de presentación del manual, pág. 11).
   SVG y no degradado: un corte duro en gradiente se rasteriza escalonado en el PDF. */
.corte{position:absolute;right:0;bottom:0;width:64mm;height:40mm;display:block}

/* ---- cabecera y pie corridos ---- */
/* Logo a 36 mm (mínimo del manual: 35 mm). Área de protección reducida a x/2 (≈1,2 mm),
   la que el manual admite en piezas pequeñas: hay 1,8 mm arriba y abajo. */
.run-head{position:absolute;left:14mm;right:14mm;top:7mm;height:12mm;display:flex;align-items:center;justify-content:space-between;
  border-bottom:.3mm solid var(--line);font-size:6.6pt;color:var(--ink-2)}
.run-head .brand{display:flex;align-items:center;gap:4mm}
.run-head .brand em{font-style:normal;font-size:6pt;letter-spacing:.2em;text-transform:uppercase;font-weight:600;color:var(--gris);
  padding-left:4mm;border-left:.25mm solid var(--line);line-height:4mm}
.run-head .where{font-weight:700;font-size:7pt;color:var(--azul)}
.run-head .where span{color:var(--ink-3);font-weight:500}
.run-foot{position:absolute;left:14mm;right:14mm;bottom:8mm;height:6mm;display:flex;align-items:center;justify-content:space-between;
  font-size:6.4pt;color:var(--ink-3)}
.run-foot .pg{font-weight:700;color:var(--azul);font-variant-numeric:tabular-nums;letter-spacing:.04em}
.run-foot a{color:var(--ink-2);font-weight:500}
/* pestaña lateral: una posición por categoría para hojear el impreso */
.tab{position:absolute;right:0;width:6mm;height:22mm;border-radius:1mm 0 0 1mm;background:var(--noche);color:#fff;
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:7pt;letter-spacing:.06em;writing-mode:vertical-rl}
.tab::before{content:"";position:absolute;left:0;top:3mm;width:.7mm;height:5mm;background:var(--rojo)}

.content{position:absolute;left:14mm;right:14mm;top:22mm;height:${CONTENT_H}mm}

/* ---- cabecera de categoría ---- */
.cat{height:${CAT_H - 4}mm;margin-bottom:4mm;border-radius:1.6mm;background:linear-gradient(115deg,var(--noche) 0%,var(--noche) 55%,var(--azul) 100%);color:#fff;position:relative;overflow:hidden;
  padding:6.4mm 7mm 6mm;display:grid;grid-template-columns:auto 1fr;column-gap:6mm;align-content:start}
.cat::after{content:"";position:absolute;left:7mm;top:0;width:14mm;height:1mm;background:var(--rojo)}
.cat .num{font-family:Archivo,Barlow,sans-serif;font-weight:900;font-stretch:118%;font-size:26pt;line-height:.95;color:var(--acero-neg)}
.cat h2{font-family:Archivo,Barlow,sans-serif;font-weight:900;font-stretch:118%;font-size:15pt;line-height:1.08;letter-spacing:-.005em}
.cat p{margin-top:1.8mm;font-size:7.8pt;color:var(--acero-claro);max-width:125mm}
.cat .count{margin-top:1.2mm;font-size:6pt;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--acero-neg)}
.cat ul{grid-column:1 / -1;list-style:none;display:flex;flex-wrap:wrap;gap:1.4mm;margin-top:3.6mm;position:relative;z-index:1}
.cat li{font-size:6.4pt;font-weight:600;padding:.9mm 2.4mm;border-radius:.8mm;background:rgba(211,217,224,.1);border:.2mm solid rgba(211,217,224,.16);color:#e6ebf1;white-space:nowrap}
.cat li span{color:var(--acero-neg);margin-left:1.2mm;font-weight:500}

/* ---- cabecera de subcategoría ---- */
.sub{height:${SUB_H}mm;display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:2.4mm;
  border-bottom:.35mm solid var(--azul);margin-bottom:0}
.sub .h{font-size:10.5pt;font-weight:700;color:var(--azul);letter-spacing:0}
.sub .h i{font-style:normal;font-weight:500;color:var(--ink-3);font-size:7.4pt;margin-left:1.6mm}
.sub .n{font-size:5.8pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--azul);background:var(--azul-1);padding:.8mm 2mm;border-radius:.8mm}

/* ---- tarjetas ---- */
.row{height:${ROW_H}mm;padding-top:2.5mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.card{height:${ROW_H - 3}mm;display:grid;grid-template-columns:31mm 1fr;gap:3.4mm;padding:2.6mm;border:.25mm solid var(--line);
  border-radius:1.6mm;background:#fff;overflow:hidden}
.card .img{width:31mm;height:31mm;border-radius:1mm;background:#fff;overflow:hidden;border:.2mm solid #edf0f3}
.card .img img{width:100%;height:100%;object-fit:cover;display:block}
.card .img.empty{background:var(--surface)}
.card .txt{display:flex;flex-direction:column;min-width:0;padding-top:.4mm}
.card .brand{font-size:5.4pt;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--gris)}
.card .ttl{margin-top:.6mm;font-size:8.4pt;font-weight:700;color:var(--azul);line-height:1.18;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .sum{margin-top:.8mm;font-size:6.8pt;color:var(--ink-2);line-height:1.3;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card dl{margin-top:auto;display:grid;grid-template-columns:auto 1fr;column-gap:1.6mm;row-gap:.2mm;font-size:6.2pt;line-height:1.3}
.card dt{color:var(--ink-3);white-space:nowrap}
.card dd{color:var(--ink);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .ref{margin-top:.9mm;font-size:6.2pt;font-weight:700;color:var(--azul);letter-spacing:.02em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ---- portada ---- */
.cover{background:var(--noche);color:#fff}
.cover .photo{position:absolute;inset:0 0 auto 0;height:178mm;background-size:cover;background-position:50% 50%}
.cover .photo::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(14,37,72,.35) 0%,rgba(14,37,72,.55) 50%,#0e2548 94%,#0e2548 100%),
             linear-gradient(90deg,rgba(14,37,72,.7) 0%,rgba(14,37,72,0) 70%)}
/* Logo negativo a 64 mm: x (alto de la D) ≈ 4,2 mm; nada entra en ese margen. */
.cover .top{position:absolute;left:16mm;right:16mm;top:16mm;display:flex;align-items:flex-start;justify-content:space-between}
.cover .top .yr{margin-top:2mm;font-size:7pt;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--acero-claro)}
.cover .title{position:absolute;left:16mm;right:16mm;top:112mm}
.cover .kicker{display:flex;align-items:center;gap:3mm;font-size:7.6pt;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--acero-claro)}
.cover .kicker::before{content:"";width:9mm;height:.9mm;background:var(--rojo)}
.cover h1{margin-top:4mm;font-family:Archivo,Barlow,sans-serif;font-weight:900;font-stretch:118%;font-size:31pt;line-height:1.04;letter-spacing:-.005em}
.cover .slogan{margin-top:5mm;font-size:7.6pt;font-weight:600;letter-spacing:.2em;line-height:1.7;text-transform:uppercase;color:var(--acero-neg);max-width:150mm}
.cover .lead{margin-top:2.4mm;font-size:10.5pt;line-height:1.45;color:var(--acero-claro);max-width:150mm}
.cover .stats{position:absolute;left:16mm;right:16mm;top:194mm;display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.cover .stat{border-top:.35mm solid rgba(211,217,224,.22);padding-top:3mm}
.cover .stat b{display:block;font-family:Archivo,Barlow,sans-serif;font-weight:900;font-stretch:118%;font-size:20pt;line-height:1.1}
.cover .stat span{display:block;margin-top:.8mm;font-size:6.2pt;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--acero-neg)}
.cover .lines{position:absolute;left:16mm;right:16mm;top:224mm;display:grid;grid-template-columns:1fr 1fr;column-gap:8mm;row-gap:0;list-style:none}
.cover .lines li{display:flex;align-items:center;gap:3mm;padding:2mm 0;border-bottom:.25mm solid rgba(211,217,224,.12);font-size:8.4pt;font-weight:600}
.cover .lines li b{font-size:6.8pt;color:var(--rojo);font-weight:700;width:5mm;letter-spacing:.04em}
.cover .lines li span{margin-left:auto;font-size:7pt;color:var(--acero-neg);font-weight:500}
.cover .foot{position:absolute;left:16mm;bottom:12mm;display:flex;gap:8mm;align-items:center;font-size:7.2pt;color:var(--acero-neg)}
.cover .foot .brands{display:flex;gap:4mm;font-weight:600;letter-spacing:.12em;text-transform:uppercase;font-size:6.4pt;color:var(--acero-claro)}

/* ---- índice ---- */
.toc-h{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:4mm;margin-bottom:6mm;border-bottom:.5mm solid var(--azul)}
.toc-h h2{font-family:Archivo,Barlow,sans-serif;font-weight:900;font-stretch:118%;font-size:22pt;color:var(--azul);line-height:1}
.toc-h p{font-size:7.6pt;color:var(--ink-2);max-width:78mm;text-align:right}
.toc{display:grid;grid-template-columns:1fr 1fr;column-gap:10mm}
.toc .c{margin-bottom:5mm;break-inside:avoid}
.toc .c > a{display:flex;align-items:baseline;gap:2.6mm;padding-bottom:1.6mm;border-bottom:.35mm solid var(--azul)}
.toc .c > a b{font-size:7.6pt;font-weight:700;color:var(--rojo);letter-spacing:.04em}
.toc .c > a strong{font-size:10pt;font-weight:700;color:var(--azul)}
.toc .c > a em{margin-left:auto;font-style:normal;font-weight:700;color:var(--azul);font-size:9pt;font-variant-numeric:tabular-nums}
.toc ul{list-style:none;margin-top:1mm}
.toc li a{display:flex;align-items:baseline;gap:1.6mm;padding:1.05mm 0;font-size:7.8pt;color:var(--ink)}
.toc li a::after{content:"";order:2;flex:1;border-bottom:.25mm dotted #c3ccd5;transform:translateY(-.6mm)}
.toc li a span{order:1}
.toc li a i{order:1;font-style:normal;color:var(--ink-3);font-size:6.6pt}
.toc li a em{order:3;font-style:normal;font-weight:700;color:var(--azul);font-variant-numeric:tabular-nums}
.how{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.how > div{border-radius:1.6mm;background:var(--surface);border:.25mm solid var(--line);padding:4mm 4.5mm}
.how b{display:inline-grid;place-items:center;width:6mm;height:6mm;border-radius:1mm;background:var(--azul);color:#fff;font-size:7pt;font-weight:700}
.how .t{margin-top:2mm;font-size:8.8pt;font-weight:700;color:var(--azul)}
.how p{margin-top:1mm;font-size:7pt;color:var(--ink-2)}
.brands-row{position:absolute;left:0;right:0;bottom:34mm;display:flex;align-items:center;gap:6mm;padding:4mm 0;border-top:.25mm solid var(--line);border-bottom:.25mm solid var(--line)}
.brands-row span{font-size:6.2pt;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3)}
.brands-row strong{font-size:8pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--azul)}
.brands-row em{font-style:normal;font-size:6.6pt;color:var(--ink-3);margin-left:-4.4mm}

/* ---- contraportada ---- */
.back{background:linear-gradient(160deg,var(--noche) 0%,var(--noche) 62%,#12305c 100%);color:#fff}
.back .logo-big{position:absolute;left:16mm;top:16mm}
.back::after{content:"";position:absolute;left:16mm;right:16mm;top:52mm;height:.35mm;background:linear-gradient(90deg,var(--rojo) 0 14mm,rgba(211,217,224,.16) 14mm)}
.back .inner{position:absolute;left:16mm;right:16mm;top:74mm;z-index:1}
.back h2{font-family:Archivo,Barlow,sans-serif;font-weight:900;font-stretch:118%;font-size:24pt;line-height:1.1;letter-spacing:-.005em;max-width:170mm;color:var(--acero-neg)}
.back h2 span{color:#fff}
.back p{margin-top:5mm;font-size:10.2pt;color:var(--acero-claro);max-width:130mm;line-height:1.5}
.back .cta{display:inline-flex;align-items:center;gap:2.6mm;margin-top:9mm;padding:3.6mm 6mm;border-radius:1.6mm;background:#25d366;color:#0e2548;font-weight:700;font-size:10pt}
.back .contact{margin-top:14mm;display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
.back .contact div{border-top:.35mm solid rgba(211,217,224,.22);padding-top:3mm}
.back .contact span{display:block;font-size:6.2pt;letter-spacing:.2em;text-transform:uppercase;color:var(--acero-neg);font-weight:600}
.back .contact a,.back .contact b{display:block;margin-top:1.4mm;font-size:9.6pt;font-weight:600;color:#fff}
.back .legal{position:absolute;left:16mm;right:84mm;bottom:14mm;font-size:6.4pt;color:var(--acero-medio);line-height:1.5}
`;
}

function runHead(cat, sub) {
  return `<header class="run-head"><div class="brand">${LOGO(36)}<em>Catálogo ${YEAR}</em></div>
  <div class="where">${esc(cat.name)}${sub ? ` <span>/ ${esc(sub)}</span>` : ''}</div></header>`;
}
function runFoot(n, total, siteUrl) {
  return `<footer class="run-foot"><a href="${esc(siteUrl)}/productos">${esc(siteUrl.replace(/^https?:\/\//, ''))}/productos</a>
  <span>Cotiza por WhatsApp con la referencia</span><span class="pg">${pad2(n)} <span style="color:var(--ink-3);font-weight:500">/ ${pad2(total)}</span></span></footer>`;
}
function tab(ci, nCats) {
  const top = 22 + ci * ((252 - 22) / Math.max(1, nCats - 1));
  return `<div class="tab" style="top:${top.toFixed(1)}mm"><span>${pad2(ci + 1)}</span></div>`;
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
  const wa = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent('Hola DAFERCOL, vi el catálogo PDF y quiero una cotización.')}`;
  const showContact = !site.__placeholder;
  // Con datos de plantilla, el botón lleva al formulario de contacto en vez de a un chat inexistente.
  const ctaHref = showContact ? wa : `${site.url}/contacto`;

  // Portada
  const counts = categories.map((c) => products.filter((p) => p.category === c.slug).length);
  const cover = `<section class="page cover">
    <div class="photo" style="background-image:url('${coverImg}')"></div>
    <div class="top">${LOGO(64, true)}<div class="yr">Edición ${YEAR}</div></div>
    <div class="title"><div class="kicker">Catálogo de productos</div>
      <h1>Soluciones para<br>sistemas de fluidos.</h1>
      <p class="slogan">${esc(site.slogan)}</p>
      <p class="lead">Referencias de ${brands.map((b) => esc(b.name)).join(', ').replace(/, ([^,]*)$/, ' y $1')}, listas para cotizar.</p></div>
    <div class="stats">
      <div class="stat"><b>${products.length}</b><span>productos y familias</span></div>
      <div class="stat"><b>${categories.length}</b><span>líneas de producto</span></div>
      <div class="stat"><b>${brands.length}</b><span>marcas</span></div>
    </div>
    <ol class="lines">${categories
      .map((c, i) => `<li><b>${pad2(i + 1)}</b>${esc(c.name)}<span>${counts[i]}</span></li>`)
      .join('')}</ol>
    <div class="foot"><span>${esc(siteHost)}</span><span class="brands">${brands.map((b) => esc(b.name)).join('<span style="opacity:.35">·</span>')}</span></div>
    ${CORTE}
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
    // "a. m." y "p. m." con espacios duros: no se parten al final de la línea.
    showContact ? ['WhatsApp', `<a href="${esc(wa)}">${esc(site.phone)}</a>`] : ['Horario', `<b>${esc(site.hours).replace(/ ([ap])\. m\./g, '\u00a0$1.\u00a0m.')}</b>`],
  ];
  const back = `<section class="page back">
    <div class="logo-big">${LOGO(64, true)}</div>
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
    })} · ${products.length} productos · ${esc(site.legalName)}.</p>
    ${CORTE}
  </section>`;

  const preview = `<script>
    // Vista previa: #p=N muestra solo la página N (para capturas de control de calidad).
    const m = location.hash.match(/p=(\\d+)/);
    if (m) { document.querySelectorAll('.page').forEach((el, i) => { if (i + 1 !== +m[1]) el.remove(); });
      document.body.style.background = '#fff'; document.querySelector('.page').style.margin = '0'; document.querySelector('.page').style.boxShadow = 'none'; }
  </script>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Catálogo DAFERCOL ${YEAR}</title>
  <meta name="author" content="${esc(site.legalName)}"><meta name="description" content="Catálogo de productos DAFERCOL ${YEAR}: ${esc(site.slogan)}">
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
  // Las mismas fuentes del sitio (Archivo 900 expandida y Barlow) y el logo oficial.
  await rm(path.join(WORK, 'fonts'), { recursive: true, force: true });
  await mkdir(path.join(WORK, 'fonts'), { recursive: true });
  for (const f of (await readdir(FONTS)).filter((f) => f.endsWith('.woff2'))) await copyFile(path.join(FONTS, f), path.join(WORK, 'fonts', f));
  // 1200 px para 64 mm de ancho ≈ 475 ppp: nítido impreso sin inflar el PDF.
  for (const v of ['color', 'negativo'])
    await sharp(path.join(LOGOS, `logo-${v}.png`)).resize(1200).png({ compressionLevel: 9 }).toFile(path.join(WORK, `logo-${v}.png`));

  const mod = await loadSite();
  const { site, categories, brands, whatsappIsPlaceholder } = mod;
  site.__placeholder = whatsappIsPlaceholder; // el PDF solo muestra el WhatsApp cuando es real
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
  await rm(OLD_PDF, { force: true });

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
  if (whatsappIsPlaceholder) {
    console.warn('\n⚠ El WhatsApp de site.ts sigue siendo de plantilla: el PDF muestra web, correo y horario.');
    console.warn('  Cuando estén los datos reales, vuelve a correr npm run catalogo.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
