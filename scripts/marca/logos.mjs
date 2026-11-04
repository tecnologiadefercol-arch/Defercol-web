/**
 * Logos web de DAFERCOL a partir del archivo oficial del manual de marca.
 *
 *   node scripts/marca/logos.mjs
 *
 * Entrada:  assets/marca/dafercol-horizontal-color.png  (versión principal, 5000 px, fondo transparente)
 * Salida:   public/marca/logo-color-{400,800}.webp       versión a color (fondos blanco y gris muy claro)
 *           public/marca/logo-negativo-{400,800}.webp    versión negativa (azul noche y azul DAFERCOL)
 *           public/marca/logo-color.png                  respaldo y uso en el PDF / Open Graph
 *           public/marca/logo-negativo.png
 *
 * El negativo se deriva del original y reproduce el negativo de la pág. 4 del
 * manual (comparado contra el PDF a 8×): el nombre, la línea y el centro del
 * manómetro pasan a blanco; los contornos azules del símbolo desaparecen (las
 * piezas quedan sin borde sobre el azul); la flecha de flujo sigue azul; "SCG
 * SAS" y las marcas del manómetro pasan a #A9B4C0. Cada píxel se descompone como
 * mezcla del azul DAFERCOL con el color de la paleta más cercano, así los bordes
 * suavizados no dejan halo.
 *
 * No es un redibujo: es el mismo archivo con otra tinta. Cuando el cliente
 * entregue el negativo oficial (o los SVG), reemplazar estos archivos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'assets/marca/dafercol-horizontal-color.png');
const OUT = path.join(ROOT, 'public/marca');
fs.mkdirSync(OUT, { recursive: true });

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const AZUL = hex('#163B6E');
const BLANCO = [255, 255, 255];
const GRIS_NEGATIVO = hex('#A9B4C0'); // "SCG SAS" y marcas del manómetro en el negativo oficial
// Colores con los que el azul se mezcla en los bordes del original.
const PALETA = ['#D3D9E0', '#9AA6B2', '#5F6E7E', '#6B7A8B', '#D2232A'].map(hex);
const GRIS_TEXTO = PALETA[3]; // misma referencia: mezcla() devuelve el elemento de PALETA

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

// Recorte al contenido (más un margen mínimo para no cortar el suavizado).
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (data[(y * W + x) * 4 + 3] > 4) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
const M = 6;
const crop = { left: Math.max(0, x0 - M), top: Math.max(0, y0 - M) };
crop.width = Math.min(W, x1 + M + 1) - crop.left;
crop.height = Math.min(H, y1 + M + 1) - crop.top;

// Zonas en píxeles del original. A la derecha de NOMBRE_X están el nombre, "SCG
// SAS" y la línea; FLECHA es la flecha de flujo (dentro del cuerpo de la válvula)
// y CENTRO, el círculo del manómetro.
const NOMBRE_X = 1700;
const FLECHA = { x0: 240, x1: 715, y0: 995, y1: 1160 };
const CENTRO = { x0: 1045, x1: 1175, y0: 590, y1: 720 };
const dentro = (z, x, y) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;

/** Fracción de azul en c: mejor ajuste c ≈ t·AZUL + (1 − t)·Q entre los colores de la paleta. */
function mezcla(c) {
  let best = { t: 0, q: null, err: Infinity };
  for (const q of PALETA) {
    const d = [AZUL[0] - q[0], AZUL[1] - q[1], AZUL[2] - q[2]];
    const v = [c[0] - q[0], c[1] - q[1], c[2] - q[2]];
    const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    let t = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / dd;
    t = Math.min(1, Math.max(0, t));
    const r = [v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]];
    const err = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    if (err < best.err) best = { t, q, err };
  }
  return best;
}

const neg = Buffer.from(data);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const a = data[i + 3];
    if (a === 0 || dentro(FLECHA, x, y)) continue;
    const c = [data[i], data[i + 1], data[i + 2]];
    const { t, q } = mezcla(c);
    // Componente no azul del píxel (≈ q, conservando la variación del original).
    const base = t < 0.999 ? c.map((v, k) => (v - t * AZUL[k]) / (1 - t)) : q.slice();
    if (q === GRIS_TEXTO) for (let k = 0; k < 3; k++) base[k] += GRIS_NEGATIVO[k] - GRIS_TEXTO[k];
    let rgb = base;
    let alpha = a;
    if (x >= NOMBRE_X || dentro(CENTRO, x, y)) rgb = base.map((v, k) => t * BLANCO[k] + (1 - t) * v);
    else alpha = a * (1 - t); // contorno del símbolo: desaparece
    for (let k = 0; k < 3; k++) neg[i + k] = Math.round(Math.min(255, Math.max(0, rgb[k])));
    neg[i + 3] = Math.round(alpha);
  }
}

const variantes = [
  ['color', data],
  ['negativo', neg],
];
for (const [nombre, buf] of variantes) {
  const base = sharp(buf, { raw: { width: W, height: H, channels: 4 } }).extract(crop);
  const full = await base.png().toBuffer();
  await sharp(full).resize({ width: 1600 }).png({ compressionLevel: 9, palette: false }).toFile(path.join(OUT, `logo-${nombre}.png`));
  for (const w of [400, 800]) {
    await sharp(full)
      .resize({ width: w, kernel: 'lanczos3' })
      .webp({ quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toFile(path.join(OUT, `logo-${nombre}-${w}.webp`));
  }
}

const ratio = crop.width / crop.height;
console.log(`recorte ${crop.width}×${crop.height} (proporción ${ratio.toFixed(4)})`);
for (const f of fs.readdirSync(OUT).filter((f) => f.startsWith('logo-')).sort()) {
  console.log(f.padEnd(28), (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1), 'KB');
}
