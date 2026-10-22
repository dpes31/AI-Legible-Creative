import { assertProjectRelations, projectSchema, type Project } from '@/domain/schema';
import { ApiFailure } from './auth';

export function serverProject(value: unknown, ownerId: string): Project {
  const project = projectSchema.parse({ ...(value as object), ownerId });
  try { assertProjectRelations(project); }
  catch { throw new ApiFailure(422, '다른 작업의 자료가 섞였거나 근거 번호가 맞지 않습니다.'); }
  // Imported local verification is historical; a new server owner must review it again.
  return { ...project,
    claims: project.claims.map(c => ({ ...c, status: 'unreviewed', reviewedBy: null })),
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) =>
      [key, doc && { ...doc, status: 'stale', validationHash: null }])) as Project['documents'],
  };
}
