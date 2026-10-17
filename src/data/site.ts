/**
 * Datos generales del sitio. Todo lo que cambia con frecuencia
 * (teléfonos, dirección, marcas, categorías) vive aquí.
 */
export const site = {
  name: 'Defercol',
  legalName: 'Defercol S.A.S.',
  tagline: 'Racores, válvulas e instrumentación industrial',
  description:
    'Distribuidor industrial en Colombia de racores, válvulas, tubería e instrumentación Swagelok, Valveco, Comfit y Ferreinstrumentos. Asesoría técnica y cotización por WhatsApp.',
  url: 'https://www.defercol.com',
  // BLOQUEANTE antes de publicar: teléfono, WhatsApp y dirección son de plantilla.
  // Todos los CTAs de cotización pasan por whatsappLink(); con este número el
  // flujo principal termina en un chat inexistente. Mientras sigan siendo de
  // plantilla, `contactIsPlaceholder` es true: el pie oculta la dirección y la
  // construcción avisa (ver abajo).
  phone: '+57 300 000 0000',
  whatsapp: '573000000000', // solo dígitos, con indicativo de país
  email: 'ventas@defercol.com',
  address: {
    street: 'Calle 00 # 00-00',
    city: 'Bogotá',
    region: 'Cundinamarca',
    country: 'CO',
  },
  hours: 'Lunes a viernes, 8:00 a. m. a 5:30 p. m.',
  catalogPath: '/catalogo/catalogo-defercol.pdf',
  googleSiteVerification: import.meta.env.PUBLIC_GOOGLE_SITE_VERIFICATION ?? '',
};

/** Número de WhatsApp y dirección de plantilla (aún sin datos reales del cliente). */
const PLACEHOLDER_WHATSAPP = '573000000000';
export const contactIsPlaceholder =
  site.whatsapp === PLACEHOLDER_WHATSAPP || /^Calle 00\b/.test(site.address.street);

if (contactIsPlaceholder && import.meta.env.PROD) {
  console.warn(
    '[Defercol] site.ts: el WhatsApp/teléfono/dirección siguen siendo de plantilla. No publicar sin los datos reales.',
  );
}

export const nav = [
  { label: 'Inicio', href: '/' },
  { label: 'Productos', href: '/productos' },
  { label: 'Quiénes somos', href: '/quienes-somos' },
  { label: 'Contacto', href: '/contacto' },
];

export interface Brand {
  slug: string;
  name: string;
  description: string;
  website?: string;
}

export const brands: Brand[] = [
  {
    slug: 'swagelok',
    name: 'Swagelok',
    description:
      'Racores para tubo, válvulas, reguladores, mangueras, filtros, instrumentación y herramientas para sistemas de fluidos.',
    website: 'https://www.swagelok.com',
  },
  {
    slug: 'valveco',
    name: 'Valveco',
    description:
      'Válvulas solenoides, de bola y mariposa, actuadores, presostatos y transmisores, manómetros, racores para tubing y accesorios sanitarios.',
  },
  {
    slug: 'comfit',
    name: 'Comfit',
    description: 'Válvulas de instrumentación, manifolds y monobridas, racores para tubing y accesorios para tubería.',
  },
  {
    slug: 'ferreinstrumentos',
    name: 'Ferreinstrumentos',
    description:
      'Uniones de golpe, válvulas para oil & gas, accesorios de tubería, instrumentación y herramientas antichispa.',
    website: 'https://www.ferreinstrumentos.com',
  },
];

export interface Subcategory {
  slug: string;
  name: string;
}

export interface Category {
  slug: string;
  name: string;
  /** Nombre corto para controles segmentados y chips (catálogo). */
  shortName: string;
  description: string;
  /** Segundo nivel del árbol. Cada producto declara una de estas en `subcategory`. */
  subcategories: Subcategory[];
}

/**
 * Árbol del catálogo: 8 categorías y sus subcategorías. El orden aquí es el
 * orden en los filtros, el inicio y el pie. Para mover un producto basta con
 * cambiar `category` y `subcategory` en su archivo de src/content/products/;
 * el esquema rechaza una subcategoría que no pertenezca a su categoría.
 */
export const categories: Category[] = [
  {
    slug: 'valvulas',
    name: 'Válvulas',
    shortName: 'Válvulas',
    description: 'Bola, aguja, cheque, solenoides, mariposa, diafragma, manifolds y actuadores.',
    subcategories: [
      { slug: 'bola', name: 'Bola' },
      { slug: 'aguja', name: 'Aguja y regulación' },
      { slug: 'cheque', name: 'Cheque y antirretorno' },
      { slug: 'alivio', name: 'Alivio y seguridad' },
      { slug: 'solenoides', name: 'Solenoides y bobinas' },
      { slug: 'mariposa', name: 'Mariposa' },
      { slug: 'compuerta-globo-macho', name: 'Compuerta, globo y tapón' },
      { slug: 'diafragma-fuelle', name: 'Diafragma y fuelle' },
      { slug: 'manifolds', name: 'Manifolds y monobridas' },
      { slug: 'actuadores', name: 'Actuadores' },
      { slug: 'acoples-rapidos', name: 'Enchufes rápidos' },
      { slug: 'especiales', name: 'Vapor y especiales' },
    ],
  },
  {
    slug: 'racores',
    name: 'Racores y conexiones',
    shortName: 'Racores',
    description: 'Racores para tubo, alta presión, VCR y VCO, roscados, soldables y uniones de golpe.',
    subcategories: [
      { slug: 'racores-para-tubo', name: 'Racores para tubo' },
      { slug: 'alta-presion', name: 'Alta presión' },
      { slug: 'cierre-frontal', name: 'Cierre frontal VCR y VCO' },
      { slug: 'roscados', name: 'Roscados' },
      { slug: 'soldables', name: 'Para soldar' },
      { slug: 'uniones-de-golpe', name: 'Uniones de golpe e integrales' },
      { slug: 'especiales', name: 'Bridas, vacío y especiales' },
    ],
  },
  {
    slug: 'tuberia',
    name: 'Tubería y mangueras',
    shortName: 'Tubería',
    description: 'Tubo y tubing, mangueras, accesorios de tubería y línea sanitaria.',
    subcategories: [
      { slug: 'tubo', name: 'Tubo y tubing' },
      { slug: 'mangueras', name: 'Mangueras y tubo flexible' },
      { slug: 'accesorios', name: 'Bridas, codos y accesorios' },
      { slug: 'sanitaria', name: 'Línea sanitaria' },
    ],
  },
  {
    slug: 'instrumentacion',
    name: 'Instrumentación y medición',
    shortName: 'Instrumentación',
    description: 'Manómetros, temperatura, transmisores, presostatos y medición de caudal.',
    subcategories: [
      { slug: 'manometros', name: 'Manómetros' },
      { slug: 'temperatura', name: 'Temperatura' },
      { slug: 'presion', name: 'Transmisores de presión' },
      { slug: 'presostatos', name: 'Presostatos y termostatos' },
      { slug: 'caudal', name: 'Caudal y contadores' },
    ],
  },
  {
    slug: 'reguladores',
    name: 'Reguladores de presión',
    shortName: 'Reguladores',
    description: 'Reductores de presión, contrapresión y reguladores para gases especiales.',
    subcategories: [
      { slug: 'presion', name: 'Reductores de presión' },
      { slug: 'contrapresion', name: 'Contrapresión' },
      { slug: 'especiales', name: 'Gases y aplicaciones especiales' },
    ],
  },
  {
    slug: 'muestreo',
    name: 'Filtración y toma de muestras',
    shortName: 'Muestreo',
    description: 'Filtros, cilindros de muestreo y sistemas para instrumentación analítica.',
    subcategories: [
      { slug: 'filtros', name: 'Filtros' },
      { slug: 'cilindros', name: 'Cilindros de muestreo' },
      { slug: 'sistemas', name: 'Sistemas analíticos' },
    ],
  },
  {
    slug: 'herramientas',
    name: 'Herramientas',
    shortName: 'Herramientas',
    description: 'Herramientas manuales y antichispa, corte y doblado de tubo y soldadura orbital.',
    subcategories: [
      { slug: 'manuales', name: 'Manuales y antichispa' },
      { slug: 'tubo', name: 'Corte y doblado de tubo' },
      { slug: 'soldadura', name: 'Soldadura orbital' },
    ],
  },
  {
    slug: 'mantenimiento',
    name: 'Mantenimiento y repuestos',
    shortName: 'Mantenimiento',
    description: 'Repuestos y kits de reparación, lubricantes, sellantes y químicos industriales.',
    subcategories: [
      { slug: 'repuestos', name: 'Repuestos y kits' },
      { slug: 'quimicos', name: 'Lubricantes y sellantes' },
    ],
  },
];

/**
 * Enlaces viejos a categorías que pasaron a ser subcategorías
 * (?categoria=uniones-de-golpe sigue funcionando en el catálogo).
 */
export const legacyCategories: Record<string, { category: string; subcategory: string }> = {
  'uniones-de-golpe': { category: 'racores', subcategory: 'uniones-de-golpe' },
  'accesorios-tuberia': { category: 'tuberia', subcategory: 'accesorios' },
};

export const brandBySlug = (slug: string) => brands.find((b) => b.slug === slug);
export const categoryBySlug = (slug: string) => categories.find((c) => c.slug === slug);
export const subcategoryBySlug = (category: string, sub: string) =>
  categoryBySlug(category)?.subcategories.find((s) => s.slug === sub);

/** Enlace de WhatsApp con mensaje opcional prellenado. */
export function whatsappLink(message = 'Hola Defercol, quiero una cotización.') {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;
}
