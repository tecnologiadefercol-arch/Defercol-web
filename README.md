# DAFERCOL — Landing page

Sitio web de DAFERCOL SCG SAS construido con [Astro](https://astro.build) 5. Es un sitio 100 % estático:
no necesita servidor ni base de datos y se puede publicar en Netlify, Vercel, Cloudflare Pages o
cualquier hosting de archivos estáticos.

## Requisitos

- Node.js 20.3 o superior (probado con 20.18). Si actualizas a Node 22 puedes migrar a Astro 6.

## Comandos

| Comando           | Acción                                              |
| ----------------- | --------------------------------------------------- |
| `npm install`     | Instala las dependencias                            |
| `npm run dev`     | Servidor local en `http://localhost:4321`           |
| `npm run build`   | Genera el sitio estático en `dist/`                 |
| `npm run preview` | Previsualiza `dist/` antes de publicar              |
| `npm run check`   | Revisa tipos y errores en componentes `.astro`      |
| `npm run catalogo` | Genera el catálogo PDF y su portada en `public/catalogo/` |

## Estructura

```
src/
  data/site.ts            Datos de la empresa, navegación, marcas y categorías
  content.config.ts       Esquema de la colección de productos
  content/products/*.md   Un archivo por producto (define la URL)
  layouts/Layout.astro    HTML base, SEO (meta, Open Graph, JSON-LD), header, footer y WhatsApp
  components/             Header, Footer, Logo, WhatsAppButton, ProductCard, CatalogFilm
  pages/
    index.astro           Inicio
    productos/index.astro Catálogo web con filtros por marca, categoría y búsqueda
    productos/[slug].astro Detalle de producto con especificaciones y relacionados
    quienes-somos.astro
    contacto.astro        Formulario que abre WhatsApp con el mensaje listo
    catalogo.astro        Descarga del catálogo PDF
    404.astro
  styles/global.css       Sistema de diseño: tokens de marca, tipografía, controles
public/
  catalogo/               catalogo-dafercol.pdf y portada.webp (los genera `npm run catalogo`)
  fonts/                  Archivo 900 expandida y Barlow 400–700 (manual de marca)
  marca/                  Logos web e íconos de app (los generan los scripts de scripts/marca/)
  images/productos/       Imágenes de productos
  robots.txt, favicon.ico, apple-touch-icon.png, site.webmanifest, og-default.png
assets/marca/             Manual de marca (PDF), logo original y avatares del manual
scripts/marca/            Generadores de logos, íconos e imagen para redes
```

## Marca

La identidad sale del **Manual de Marca DAFERCOL v1.0** (`assets/marca/`). Lo esencial:

- **Color.** Azul DAFERCOL `#163B6E` para nombre, títulos y textos principales; azul noche
  `#0E2548` para fondos en negativo (film del inicio, heros, pie); rojo manómetro `#D2232A`
  solo como acento puntual (raya de las etiquetas, página actual, progreso), nunca en
  botones ni fondos; aceros `#D3D9E0` `#9AA6B2` `#5F6E7E` y gris texto `#6B7A8B`.
- **Tipografía.** Archivo 900 expandida (118 %) para titulares grandes; Barlow para todo
  lo demás. Etiquetas en mayúsculas espaciadas. Ambas alojadas en `public/fonts/`.
- **Logo.** Componente `Logo.astro`: versión a color sobre blanco o gris muy claro,
  negativa sobre azul noche o azul DAFERCOL; mínimo 160 px de ancho en pantalla. No
  redibujar ni recomponer.

Recursos derivados (correr de nuevo si cambian los originales):

| Comando | Genera |
| ------- | ------ |
| `node scripts/marca/logos.mjs` | `public/marca/logo-{color,negativo}-*.webp` y `.png` desde `assets/marca/dafercol-horizontal-color.png`. El negativo reproduce el de la pág. 4 del manual (nombre y línea en blanco, piezas sin contorno). |
| `node scripts/marca/iconos.mjs` | `favicon.ico` (símbolo reducido, pág. 5), `apple-touch-icon.png` e íconos del manifiesto, desde los avatares de la pág. 11. |
| `node scripts/marca/og.mjs` | `public/og-default.png` (1200 × 630). |
| `swift scripts/marca/recorte-manual.swift …` | Renderiza una zona del PDF del manual a PNG (así se sacaron los avatares). |

Cuando el cliente entregue los archivos oficiales en SVG y la versión negativa, conviene
reemplazar los derivados de `public/marca/`.

## Cómo agregar un producto

1. Crea un archivo en `src/content/products/`, por ejemplo `swagelok-valvula-aguja.md`.
   El nombre del archivo será la URL: `/productos/swagelok-valvula-aguja`.
2. Copia el encabezado de otro producto y ajusta los campos:

```md
---
title: 'Válvula de aguja Swagelok'
brand: swagelok            # swagelok | valveco | comfit | ferreinstrumentos
category: valvulas         # valvulas | racores | tuberia | instrumentacion | reguladores |
                           # muestreo | herramientas | mantenimiento
subcategory: aguja         # una de las subcategorías de esa categoría (ver `categories` en site.ts)
summary: 'Texto corto para la tarjeta (máximo 220 caracteres).'
image: '/images/productos/swagelok-valvula-aguja.jpg'   # opcional
imageFit: contain          # contain = foto recortada sobre fondo blanco; cover (defecto) = foto a sangre
featured: true             # aparece en "Productos destacados" del inicio
sku: 'SS-1RS4'             # opcional
order: 25                  # menor = aparece primero
specs:
  - { label: 'Material', value: 'Acero inoxidable 316' }
datasheet: 'https://...'   # opcional, enlace a ficha técnica
tags: ['válvula', 'aguja']  # palabras extra para la búsqueda
---

Descripción larga en Markdown.
```

3. Guarda la imagen en `public/images/productos/`. Si no hay imagen se usa un placeholder.
   Las fotos de Ferreinstrumentos y Swagelok viven en `public/images/ferreinstrumentos/` y
   `public/images/swagelok/`; cada carpeta tiene un `indice.csv` con el origen de cada imagen.

Para agregar una marca, una categoría o una subcategoría, edita los arreglos `brands` y
`categories` en `src/data/site.ts`; el esquema de productos y los filtros se actualizan solos.
El build falla si un producto declara una subcategoría que no pertenece a su categoría, y el
mensaje lista las opciones válidas.

El catálogo acepta enlaces con `?categoria=valvulas&sub=solenoides&marca=valveco&q=ev220`.
Los enlaces viejos a `?categoria=uniones-de-golpe` y `?categoria=accesorios-tuberia` siguen
funcionando: llevan a la categoría y subcategoría nuevas (`legacyCategories` en `site.ts`).

## Catálogo PDF

`npm run catalogo` arma el PDF descargable desde los mismos datos del sitio: portada,
índice con números de página, una sección por categoría y subcategoría, tarjetas de
producto con foto, datos clave y enlace a su ficha, y contraportada de contacto.
El script vive en `scripts/catalogo/build.mjs` y necesita Google Chrome (o
`CHROME_PATH=/ruta/al/chrome`). Tarda unos 10 segundos.

- **Peso.** Las fotos se reducen a miniaturas JPEG de 240 px (≈ 200 ppp al tamaño
  impreso) y Chrome las incrusta sin recomprimir. El texto es vectorial y las tipografías
  de la marca (Archivo y Barlow, licencia OFL, de `public/fonts/`) se incrustan solo con
  los caracteres usados.
- **Navegación.** El índice y las tarjetas son enlaces; el PDF trae marcadores por
  categoría y subcategoría en el panel lateral del lector.
- **Contacto.** Mientras `whatsappIsPlaceholder` sea verdadero, el PDF muestra web, correo
  y horario, y el botón de WhatsApp lleva a `/contacto`. Con los datos reales, vuelve a
  generar el PDF.
- **Cuándo regenerarlo.** Cada vez que cambien productos, fotos, categorías o contacto.
  La página `/catalogo` lee el número de páginas, el peso y la fecha del archivo al compilar.

## Pendientes antes de publicar

- [x] WhatsApp y teléfono reales en `src/data/site.ts` (+57 311 210 9248, confirmado el 3-nov-2026).
- [ ] Dirección, correo y horario reales en `src/data/site.ts` (la dirección se oculta mientras sea de plantilla).
- [ ] Cuando www.dafercol.com apunte a Vercel: definir `SITE_URL=https://www.dafercol.com` (Vercel → Settings → Environment Variables, o `.env`), volver a generar el catálogo y publicar. Hoy todo usa `https://defercol.vercel.app` (ver `astro.config.mjs`).
- [ ] Regenerar el catálogo con `npm run catalogo` cuando estén los datos de contacto reales.
- [ ] Reemplazar los productos de ejemplo por los reales y agregar sus imágenes.
- [ ] Ajustar los textos de "Quiénes somos".
- [ ] Pegar el iframe de Google Maps en `src/pages/contacto.astro`.
- [ ] Google Search Console: crear `.env` a partir de `.env.example` con el código de verificación
      y, una vez publicado, enviar `https://<dominio>/sitemap-index.xml`.
- [ ] Crear o reclamar el perfil de Google Business y enlazarlo al sitio.

## Nota de seguridad

`npm audit` reporta avisos en `astro`, `esbuild` y `sharp`. Afectan al servidor de desarrollo o al
proceso de build, no al sitio publicado (HTML estático). Para resolverlos hay que subir a Node 22 y
Astro 6 o superior.
