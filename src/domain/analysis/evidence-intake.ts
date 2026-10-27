import { claimSchema, sourceSchema, type Project, type SourceSnapshot } from '../schema';
import { captureSource, revalidateEvidence } from './source-audit';

type CaptureDetails = Pick<SourceSnapshot, 'method' | 'locator' | 'coverage' | 'modelScope' | 'conditionScope' | 'interest'>;
export function evidenceChanged(project: Project): Project {
  return revalidateEvidence({ ...project, evidenceRevision: project.evidenceRevision + 1,
    manualResearchRequestId: null, manualResearchInputHash: null, manualContentRequestId: null,
    insight: { ...project.insight, approval: 'pending', approvedAt: null },
    answerPlans: project.answerPlans.map(plan => plan.reviewStatus === 'reviewed' ? { ...plan, reviewStatus: 'proposed' } : plan),
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'] });
}
export function storeEvidenceSource(project: Project, input: unknown, details: CaptureDetails): Project {
  const source = sourceSchema.parse(input);
  if (source.projectId !== project.id) throw new Error('다른 프로젝트의 자료입니다.');
  const captured = sourceSchema.parse(captureSource(source, details));
  return evidenceChanged({ ...project, sources: [...project.sources.filter(item => item.id !== source.id), captured] });
}
export function recordSourceSnapshot(project: Project, sourceId: string, details: CaptureDetails): Project {
  const source = project.sources.find(item => item.id === sourceId);
  if (!source) throw new Error('원문 자료를 찾지 못했습니다.');
  if (source.origin === 'external_response') throw new Error('외부 AI 발췌만으로 수집 증적을 만들 수 없습니다. 실제 원문을 먼저 연결해 주세요.');
  return storeEvidenceSource(project, source, details);
}
export function addEvidenceClaim(project: Project, sourceId: string,
  input: { statement: string; quote: string; subject: string; conditions: string }) {
  if (!project.sources.some(item => item.id === sourceId)) throw new Error('원문 자료를 찾지 못했습니다.');
  const claim = claimSchema.parse({ ...input, id: crypto.randomUUID(), projectId: project.id, sourceId,
    status: 'unreviewed', reviewedBy: null, target: input.subject.includes(project.name) ? 'own' : 'unresolved' });
  return evidenceChanged({ ...project, claims: [...project.claims, claim] });
}
