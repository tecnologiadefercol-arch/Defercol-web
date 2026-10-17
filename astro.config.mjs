// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Cambia esta URL por el dominio definitivo antes de publicar.
  site: 'https://www.defercol.com',
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
