# Defercol — Landing page

Sitio web de Defercol construido con [Astro](https://astro.build) 5. Es un sitio 100 % estático:
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

## Estructura

```
src/
  data/site.ts            Datos de la empresa, navegación, marcas y categorías
  content.config.ts       Esquema de la colección de productos
  content/products/*.md   Un archivo por producto (define la URL)
  layouts/Layout.astro    HTML base, SEO (meta, Open Graph, JSON-LD), header, footer y WhatsApp
  components/             Header, Footer, WhatsAppButton, ProductCard
  pages/
    index.astro           Inicio
    productos/index.astro Catálogo web con filtros por marca, categoría y búsqueda
    productos/[slug].astro Detalle de producto con especificaciones y relacionados
    quienes-somos.astro
    contacto.astro        Formulario que abre WhatsApp con el mensaje listo
    catalogo.astro        Descarga del catálogo PDF
    404.astro
  styles/global.css       Variables de color, tipografía y utilidades
public/
  catalogo/               Aquí va catalogo-defercol.pdf
  images/productos/       Imágenes de productos
  robots.txt, favicon.svg, og-default.png
```

## Cómo agregar un producto

1. Crea un archivo en `src/content/products/`, por ejemplo `swagelok-valvula-aguja.md`.
   El nombre del archivo será la URL: `/productos/swagelok-valvula-aguja`.
2. Copia el encabezado de otro producto y ajusta los campos:

```md
---
title: 'Válvula de aguja Swagelok'
brand: swagelok            # swagelok | valveco | comfit | ferreinstrumentos
category: valvulas         # racores | valvulas | tuberia | instrumentacion | reguladores |
                           # uniones-de-golpe | accesorios-tuberia | herramientas | mantenimiento
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
   Las fotos de Ferreinstrumentos viven en `public/images/ferreinstrumentos/` (ver `indice.csv` ahí).

Para agregar una marca o categoría nueva, edita los arreglos `brands` y `categories` en
`src/data/site.ts`; el esquema de productos y los filtros se actualizan solos.

## Pendientes antes de publicar

- [ ] Reemplazar teléfono, WhatsApp, correo, dirección y horario en `src/data/site.ts`.
- [ ] Cambiar `site` en `astro.config.mjs` y la URL del sitemap en `public/robots.txt` por el dominio real.
- [ ] Subir el catálogo como `public/catalogo/catalogo-defercol.pdf`.
- [ ] Reemplazar los productos de ejemplo por los reales y agregar sus imágenes.
- [ ] Ajustar los textos de "Quiénes somos".
- [ ] Pegar el iframe de Google Maps en `src/pages/contacto.astro`.
- [ ] Google Search Console: crear `.env` a partir de `.env.example` con el código de verificación
      y, una vez publicado, enviar `https://<dominio>/sitemap-index.xml`.
- [ ] Crear o reclamar el perfil de Google Business y enlazarlo al sitio.
- [ ] Opcional: reemplazar `public/og-default.png` por una imagen de marca (1200 × 630 px).

## Nota de seguridad

`npm audit` reporta avisos en `astro`, `esbuild` y `sharp`. Afectan al servidor de desarrollo o al
proceso de build, no al sitio publicado (HTML estático). Para resolverlos hay que subir a Node 22 y
Astro 6 o superior.
