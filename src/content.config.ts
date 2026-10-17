import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { brands, categories } from './data/site';

const brandSlugs = brands.map((b) => b.slug) as [string, ...string[]];
const categorySlugs = categories.map((c) => c.slug) as [string, ...string[]];

/**
 * Cada producto es un archivo Markdown en src/content/products/.
 * El nombre del archivo define la URL: swagelok-racor-tubo.md -> /productos/swagelok-racor-tubo
 */
const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    title: z.string(),
    brand: z.enum(brandSlugs),
    category: z.enum(categorySlugs),
    subcategory: z.string(),
    summary: z.string().max(220),
    image: z.string().optional(),
    /** `contain` para fotos recortadas sobre fondo blanco/transparente; `cover` (defecto) para fotos a sangre. */
    imageFit: z.enum(['cover', 'contain']).default('cover'),
    featured: z.boolean().default(false),
    sku: z.string().optional(),
    specs: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
    datasheet: z.string().optional(),
    tags: z.array(z.string()).default([]),
    order: z.number().default(100),
  }).superRefine((d, ctx) => {
    const cat = categories.find((c) => c.slug === d.category);
    if (!cat?.subcategories.some((s) => s.slug === d.subcategory)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subcategory'],
        message: `"${d.subcategory}" no es una subcategoría de "${d.category}". Opciones: ${cat?.subcategories.map((s) => s.slug).join(', ')}`,
      });
    }
  }),
});

export const collections = { products };
