/**
 * Favicon e íconos de app de DAFERCOL a partir de los avatares del manual (pág. 11).
 *
 *   node scripts/marca/iconos.mjs
 *
 * Entradas (renders del PDF vectorial, ver recorte-manual.swift):
 *   assets/marca/avatar-reducido.png   símbolo reducido en negativo sobre círculo azul noche
 *       swift scripts/marca/recorte-manual.swift "assets/marca/Manual de Marca DAFERCOL.pdf" 11 552 290 40 40 26 assets/marca/avatar-reducido.png
 *   assets/marca/avatar-completo.png   símbolo completo en negativo sobre círculo azul noche
 *       swift scripts/marca/recorte-manual.swift "assets/marca/Manual de Marca DAFERCOL.pdf" 11 445 262 96 96 11 assets/marca/avatar-completo.png
 *
 * Salidas:
 *   public/favicon.ico                  16, 32 y 48 px — símbolo reducido (el manual lo pide bajo 64 px)
 *   public/apple-touch-icon.png         180 px, cuadrado azul noche (iOS redondea las esquinas)
 *   public/marca/icono-192.png, icono-512.png   símbolo completo en círculo, para el manifiesto
 *   public/marca/icono-maskable-512.png cuadrado azul noche con zona segura, para Android
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const A = (p) => path.join(ROOT, p);
const NOCHE = { r: 14, g: 37, b: 72 }; // #0E2548

/** Círculo azul noche del avatar: caja de los píxeles de ese color. */
async function circulo(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (Math.abs(data[i] - NOCHE.r) + Math.abs(data[i + 1] - NOCHE.g) + Math.abs(data[i + 2] - NOCHE.b) < 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  const d = Math.min(x1 - x0, y1 - y0) + 1;
  return { left: x0, top: y0, d };
}

/** Avatar recortado al círculo, con las esquinas transparentes (máscara suavizada). */
async function avatarCircular(file) {
  const c = await circulo(file);
  const r = c.d / 2;
  const mask = Buffer.alloc(c.d * c.d);
  for (let y = 0; y < c.d; y++)
    for (let x = 0; x < c.d; x++) {
      const dist = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      // 4 px adentro (sobre ~1000 px): el borde suavizado del render trae mezcla con el blanco de la página.
      mask[y * c.d + x] = Math.round(255 * Math.min(1, Math.max(0, r - 4 - dist + 0.5)));
    }
  const rgb = await sharp(file).extract({ left: c.left, top: c.top, width: c.d, height: c.d }).removeAlpha().raw().toBuffer();
  return sharp(rgb, { raw: { width: c.d, height: c.d, channels: 3 } })
    .joinChannel(mask, { raw: { width: c.d, height: c.d, channels: 1 } })
    .png()
    .toBuffer();
}

/** Avatar sobre un cuadrado azul noche: el círculo (ya sin esquinas blancas) se funde con el fondo. */
async function avatarCuadrado(circular, lado, escalaSimbolo = 1) {
  const inner = Math.round(lado * escalaSimbolo);
  let simbolo = await sharp(circular).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer();
  if (inner > lado) {
    const o = Math.floor((inner - lado) / 2);
    simbolo = await sharp(simbolo).extract({ left: o, top: o, width: lado, height: lado }).png().toBuffer();
  }
  const pos = Math.max(0, Math.round((lado - inner) / 2));
  return sharp({ create: { width: lado, height: lado, channels: 4, background: { ...NOCHE, alpha: 1 } } })
    .composite([{ input: simbolo, left: pos, top: pos }])
    .flatten({ background: NOCHE })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** .ico con imágenes PNG embebidas (formato admitido por todos los navegadores actuales). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

fs.mkdirSync(A('public/marca'), { recursive: true });

const reducido = await avatarCircular(A('assets/marca/avatar-reducido.png'));
const completo = await avatarCircular(A('assets/marca/avatar-completo.png'));

const tam = async (buf, s) => sharp(buf).resize(s, s, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
const favs = [];
for (const s of [16, 32, 48]) favs.push({ size: s, buf: await tam(reducido, s) });
fs.writeFileSync(A('public/favicon.ico'), ico(favs));
fs.writeFileSync(A('public/marca/favicon-48.png'), favs[2].buf);

fs.writeFileSync(A('public/marca/icono-192.png'), await tam(completo, 192));
fs.writeFileSync(A('public/marca/icono-512.png'), await tam(completo, 512));
fs.writeFileSync(A('public/apple-touch-icon.png'), await avatarCuadrado(completo, 180, 1.06));
// Android recorta los íconos "maskable" hasta un círculo del 80 %: el símbolo va más pequeño.
fs.writeFileSync(A('public/marca/icono-maskable-512.png'), await avatarCuadrado(completo, 512, 0.86));

for (const f of ['public/favicon.ico', 'public/apple-touch-icon.png', 'public/marca/favicon-48.png', 'public/marca/icono-192.png', 'public/marca/icono-512.png', 'public/marca/icono-maskable-512.png'])
  console.log(f.padEnd(36), (fs.statSync(A(f)).size / 1024).toFixed(1), 'KB');
