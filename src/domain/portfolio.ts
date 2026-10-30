import { z } from 'zod';
import { categorySchema, type Project } from './schema';

const uid = z.string().uuid();
const timestamp = z.string().datetime();

export const brandProfileSchema = z.object({
  id: uid, ownerId: z.string().min(1), schemaVersion: z.literal(1), name: z.string().trim().min(1),
  aliases: z.array(z.string()).default([]), officialDomains: z.array(z.string()).default([]),
  youtubePrefix: z.object({ berex: z.string(), environment: z.string(), wearable: z.string() }).nullable(),
  revision: z.number().int().nonnegative(), createdAt: timestamp, updatedAt: timestamp,
});
export type BrandProfile = z.infer<typeof brandProfileSchema>;

export const catalogEntitySchema = z.object({
  id: uid, brandId: uid, ownerId: z.string().min(1), schemaVersion: z.literal(1),
  parentId: uid.nullable(), level: z.enum(['category', 'product', 'model', 'service']), category: categorySchema,
  officialName: z.string().trim().min(1), aliases: z.array(z.string()), modelCode: z.string().nullable(),
  market: z.string(), officialUrl: z.string().nullable(), projectId: uid.nullable(),
  revision: z.number().int().nonnegative(), createdAt: timestamp, updatedAt: timestamp,
});
export type CatalogEntity = z.infer<typeof catalogEntitySchema>;

export function newBrandProfile(name: string, ownerId = 'local'): BrandProfile {
  const at = new Date().toISOString();
  const coway = name.trim() === '코웨이' || name.trim().toLowerCase() === 'coway';
  return brandProfileSchema.parse({ id: crypto.randomUUID(), ownerId, schemaVersion: 1, name: name.trim(),
    aliases: coway ? ['COWAY', '코웨이'] : [], officialDomains: [],
    youtubePrefix: coway ? { berex: '[COWAY BEREX]', environment: '[COWAY]', wearable: '[COWAY]' } : null,
    revision: 0, createdAt: at, updatedAt: at });
}

export function titlePrefix(project: Project, brand: BrandProfile | null): string | null {
  if (!brand || project.brandId !== brand.id || !brand.youtubePrefix) return null;
  if (project.category === 'berex') return brand.youtubePrefix.berex;
  if (project.category === 'environment' || project.category === 'wearable') return brand.youtubePrefix[project.category];
  return null; // Unclassified products must not be guessed from their name.
}
