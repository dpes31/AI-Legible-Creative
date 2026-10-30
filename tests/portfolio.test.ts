import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { newBrandProfile, titlePrefix, type CatalogEntity } from '../src/domain/portfolio';
import { newProject } from '../src/domain/schema';
import { listBrandProfiles, listCatalogEntities, saveBrandProfile, saveCatalogEntity } from '../src/data/repository';

it('브랜드를 명시적으로 묶고 다른 브랜드의 모델을 같은 계층으로 연결하지 않는다', async () => {
  const coway = await saveBrandProfile(newBrandProfile('코웨이'), null);
  const other = await saveBrandProfile(newBrandProfile('가상 타사'), null);
  const project = newProject({ name: '허구 의자', kind: 'product', model: 'A', brandId: coway.id, brandName: coway.name,
    category: 'berex', description: '', officialUrl: '', objective: 'feature', audience: '', audienceUndecided: true,
    selectedChannels: ['youtube_description'], mode: 'manual' });
  expect(titlePrefix(project, coway)).toBe('[COWAY BEREX]');
  expect(titlePrefix(project, other)).toBeNull();
  expect(titlePrefix({ ...project, category: 'unknown' }, coway)).toBeNull();
  const at = new Date().toISOString();
  const root: CatalogEntity = { id: crypto.randomUUID(), brandId: other.id, ownerId: 'local', schemaVersion: 1,
    parentId: null, level: 'category', category: 'other', officialName: '가상 분류', aliases: [], modelCode: null,
    market: 'KR', officialUrl: null, projectId: null, revision: 0, createdAt: at, updatedAt: at };
  await saveCatalogEntity(root, null);
  await expect(saveCatalogEntity({ ...root, id: crypto.randomUUID(), brandId: coway.id, parentId: root.id,
    level: 'model', officialName: '잘못 연결한 모델' }, null)).rejects.toThrow('같은 브랜드');
  expect(await listCatalogEntities(coway.id)).toHaveLength(0);
  expect((await listBrandProfiles()).some(b => b.id === coway.id)).toBe(true);
});
