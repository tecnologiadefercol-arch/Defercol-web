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
    description: 'Racores de tubo, válvulas, reguladores y mangueras para sistemas de fluidos.',
    website: 'https://www.swagelok.com',
  },
  {
    slug: 'valveco',
    name: 'Valveco',
    description: 'Válvulas de compuerta, globo, cheque y bola para proceso.',
  },
  {
    slug: 'comfit',
    name: 'Comfit',
    description: 'Racores de compresión y mangueras hidráulicas.',
  },
  {
    slug: 'ferreinstrumentos',
    name: 'Ferreinstrumentos',
    description:
      'Uniones de golpe, válvulas para oil & gas, accesorios de tubería, instrumentación y herramientas antichispa.',
    website: 'https://www.ferreinstrumentos.com',
  },
];

export interface Category {
  slug: string;
  name: string;
  /** Nombre corto para controles segmentados y chips (catálogo). */
  shortName: string;
  description: string;
}

export const categories: Category[] = [
  {
    slug: 'racores',
    name: 'Racores y conexiones',
    shortName: 'Racores',
    description: 'Tubo, compresión y rosca en inoxidable, bronce y acero al carbono.',
  },
  {
    slug: 'valvulas',
    name: 'Válvulas',
    shortName: 'Válvulas',
    description: 'Bola, compuerta, globo, cheque y aguja.',
  },
  {
    slug: 'tuberia',
    name: 'Tubería y mangueras',
    shortName: 'Tubería',
    description: 'Tubería inoxidable y mangueras hidráulicas y flexibles.',
  },
  {
    slug: 'instrumentacion',
    name: 'Instrumentación y medición',
    shortName: 'Instrumentación',
    description: 'Manómetros, termómetros, transmisores y montaje.',
  },
  {
    slug: 'reguladores',
    name: 'Reguladores de presión',
    shortName: 'Reguladores',
    description: 'Presión y contrapresión para gases y líquidos.',
  },
  {
    slug: 'uniones-de-golpe',
    name: 'Uniones de golpe y accesorios integrales',
    shortName: 'Uniones de golpe',
    description: 'Hammer unions Fig. 100 a 2202, codos y tees integrales, swivel joints y pup joints.',
  },
  {
    slug: 'accesorios-tuberia',
    name: 'Accesorios de tubería',
    shortName: 'Accesorios',
    description: 'Bridas, codos, tees, caps, ring gaskets y juntas antivibratorias.',
  },
  {
    slug: 'herramientas',
    name: 'Herramientas antichispa y manuales',
    shortName: 'Herramientas',
    description: 'Llaves, macetas, picas y palas antichispa para áreas clasificadas, y línea Truper.',
  },
  {
    slug: 'mantenimiento',
    name: 'Mantenimiento y repuestos',
    shortName: 'Mantenimiento',
    description: 'Kits de reparación, sellos O-ring, lubricantes y desengrasantes industriales.',
  },
];

export const brandBySlug = (slug: string) => brands.find((b) => b.slug === slug);
export const categoryBySlug = (slug: string) => categories.find((c) => c.slug === slug);

/** Enlace de WhatsApp con mensaje opcional prellenado. */
export function whatsappLink(message = 'Hola Defercol, quiero una cotización.') {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;
}
