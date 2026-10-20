import { projectSchema, type Project } from '@/domain/schema';
import { ApiFailure } from './auth';

export function serverProject(value: unknown, ownerId: string): Project {
  const project = projectSchema.parse({ ...(value as object), ownerId });
  if (project.sources.some(s => s.projectId !== project.id) || project.claims.some(c => c.projectId !== project.id)) {
    throw new ApiFailure(422, '다른 프로젝트의 자료가 섞여 있어 저장할 수 없습니다.');
  }
  const sources = new Set(project.sources.map(s => s.id));
  const claims = new Set(project.claims.map(c => c.id));
  if (project.claims.some(c => c.sourceId && !sources.has(c.sourceId)) ||
      project.documents && Object.values(project.documents).some(doc => doc?.blocks.some(b => b.claimRefs.some(ref => !claims.has(ref))))) {
    throw new ApiFailure(422, '문서의 근거 번호가 실제 자료와 맞지 않습니다.');
  }
  // Imported local verification is historical; a new server owner must review it again.
  return { ...project,
    claims: project.claims.map(c => ({ ...c, status: 'unreviewed', reviewedBy: null })),
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) =>
      [key, doc && { ...doc, status: 'stale', validationHash: null }])) as Project['documents'],
  };
}
