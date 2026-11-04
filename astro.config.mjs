// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';

/*
  URL pública del sitio: canónicas, sitemap, robots.txt, Open Graph y los enlaces
  del catálogo PDF salen de aquí (src/data/site.ts la lee como import.meta.env.SITE).
  Por defecto es el despliegue de Vercel. Cuando www.dafercol.com apunte al
  proyecto, define SITE_URL=https://www.dafercol.com en Vercel (Settings →
  Environment Variables) o en .env, y vuelve a generar el catálogo.
*/
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const SITE_URL = (process.env.SITE_URL || env.SITE_URL || 'https://defercol.vercel.app').replace(/\/+$/, '');

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
  // Las hojas de estilo son pequeñas: en línea evitan dos peticiones que bloquean el render.
  build: { inlineStylesheets: 'always' },
  vite: {
    server: {
      // El proyecto vive en un volumen externo donde los eventos del sistema de
      // archivos no llegan a Vite; con sondeo el servidor sí recoge los cambios.
      watch: { usePolling: true, interval: 500 },
    },
  },
});
