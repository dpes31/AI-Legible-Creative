import type { Project } from './schema';

export function insightCurrent(project: Project): boolean {
  return project.insight.approval !== 'pending' && project.insight.inputRevision === project.inputRevision &&
    project.insight.evidenceRevision === project.evidenceRevision;
}

export function reviseInsight(project: Project, feedback: string): Project {
  if (feedback.length > 10000) throw new Error('수정 의견은 1만 자 이내로 적어 주세요.');
  if (feedback === project.insight.feedback) return project;
  const revision = project.insight.revision + 1;
  return { ...project, insight: { ...project.insight, revision, feedback, approval: 'pending', approvedAt: null,
    feedbackHistory: [...project.insight.feedbackHistory, { text: feedback, revision, at: new Date().toISOString() }] },
    manualContentRequestId: null,
    documents: Object.fromEntries(Object.entries(project.documents).map(([channel, doc]) => [channel, doc && { ...doc, status: 'stale' }])) as Project['documents'] };
}

export function hasUsableEvidence(project: Project): boolean {
  return project.claims.some(c => c.status === 'supported' && c.target !== 'competitor' && c.target !== 'unresolved' &&
    project.sources.some(s => s.id === c.sourceId && s.publicationAllowed && s.externalAiAllowed && s.origin !== 'external_response'));
}

export function approveInsight(project: Project, outline = false): Project {
  if (!project.name.trim()) throw new Error('대상 이름을 먼저 입력해 주세요.');
  if (!hasUsableEvidence(project) && !outline && !project.claims.some(c => c.target === 'own' && c.status === 'unreviewed' &&
    project.sources.some(s => s.id === c.sourceId && !!c.quote && !!s.excerpt && s.externalAiAllowed))) {
    throw new Error('공개할 수 있는 사실이나 검토할 제품 사실 후보가 없습니다. 자료를 보완하거나 구성안을 선택해 주세요.');
  }
  return { ...project, insight: { ...project.insight, revision: project.insight.revision + 1,
    approval: outline ? 'outline' : 'approved', inputRevision: project.inputRevision,
    evidenceRevision: project.evidenceRevision, approvedAt: new Date().toISOString() }, manualContentRequestId: null };
}
