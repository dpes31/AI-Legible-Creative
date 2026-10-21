import { fingerprint } from './text';
import { type Channel, type Project } from './schema';

function publicBody(project: Project, channel: Channel): string {
  return project.documents[channel]?.blocks.filter(block => block.kind !== 'note').map(block => block.text.trim())
    .filter(Boolean).join('\n\n').trim() || '';
}

export function saveQuestionAnswer(project: Project, questionId: string, answer: string, claimIds: string[]): Project {
  if (!project.questions.some(q => q.id === questionId) || !answer.trim()) throw new Error('고객 질문과 답변을 확인해 주세요.');
  if (claimIds.some(id => !project.claims.some(c => c.id === id && c.status === 'supported' && c.target !== 'competitor' &&
    project.sources.some(s => s.id === c.sourceId && s.publicationAllowed && s.origin !== 'external_response'))))
    throw new Error('확인되지 않은 제품 사실은 답변의 근거로 연결할 수 없습니다.');
  const previous = project.questionAnswers.find(item => item.questionId === questionId);
  const item = { id: previous?.id || crypto.randomUUID(), questionId, answer: answer.trim(), claimIds,
    status: 'draft' as const, revision: (previous?.revision || 0) + 1, updatedAt: new Date().toISOString() };
  return { ...project, questionAnswers: [...project.questionAnswers.filter(x => x.questionId !== questionId), item] };
}

export function recordPublication(project: Project, channel: Channel, url: string, publishedAt = new Date().toISOString()): Project {
  const document = project.documents[channel]; const body = publicBody(project, channel);
  if (!document || !body || document.status !== 'ready') throw new Error('최종본으로 확인한 채널 문서만 게시 기록에 연결할 수 있습니다.');
  const address = new URL(url);
  if (!['https:', 'http:'].includes(address.protocol) || address.username || address.password || !address.hostname.includes('.'))
    throw new Error('공개된 게시 페이지의 HTTP(S) 주소를 입력해 주세요.');
  if (Number.isNaN(Date.parse(publishedAt))) throw new Error('게시 날짜를 확인해 주세요.');
  if (project.publications.some(p => p.url === url && p.channel === channel && p.documentRevision === document.revision)) return project;
  return { ...project, publications: [...project.publications, { id: crypto.randomUUID(), channel,
    documentId: document.id, documentRevision: document.revision, documentHash: fingerprint(body),
    contentSnapshot: body, url, publishedAt: new Date(publishedAt).toISOString(), verifiedAt: null, status: 'reported' }] };
}

export function verifyPublicationText(project: Project, publicationId: string, postedText: string): Project {
  const target = project.publications.find(item => item.id === publicationId);
  if (!target || !postedText.trim()) throw new Error('게시된 본문을 붙여넣어 주세요.');
  if (fingerprint(postedText.trim()) !== target.documentHash)
    throw new Error('게시된 본문이 보관한 원고와 다릅니다. 게시본의 수정 사항을 확인해 주세요.');
  return { ...project, publications: project.publications.map(item => item.id === publicationId ?
    { ...item, status: 'confirmed' as const, verifiedAt: new Date().toISOString() } : item) };
}

export function improvementSuggestions(project: Project): { title: string; reason: string; questionIds: string[]; sourceIds: string[] }[] {
  const questions = project.questions.filter(q => !project.questionAnswers.some(a => a.questionId === q.id));
  const unresolved = project.claims.filter(c => c.status === 'insufficient' || c.status === 'contradicted');
  return [
    ...questions.slice(0, 5).map(q => ({ title: `고객 질문 답변 보완: ${q.text}`, reason: q.provenance === 'hypothesis' ?
      '가설 질문입니다. 실제 고객에게 중요할지 확인하고 답변 근거를 모아 주세요.' : '근거가 있는 답변과 적용 모델을 정리해 주세요.',
      questionIds: [q.id], sourceIds: q.sourceIds })),
    ...unresolved.slice(0, 5).map(c => ({ title: `제품 사실 확인: ${c.statement}`, reason: '원문 불일치 또는 근거 부족으로 공개 문구에 사용할 수 없습니다.',
      questionIds: [], sourceIds: c.sourceId ? [c.sourceId] : [] })),
    ...project.publications.filter(p => p.status === 'reported').slice(0, 5).map(p => ({ title: `게시본 확인: ${p.url}`,
      reason: '게시 URL은 기록했으나 실제 게시 문구와 보관한 원고의 일치는 확인하지 않았습니다.', questionIds: [], sourceIds: [] })),
  ];
}

export function importSameModelEvidence(target: Project, from: Project): Project {
  if (!target.brandId || target.brandId !== from.brandId || target.name !== from.name ||
      !target.model || target.model !== from.model || target.category !== from.category || target.market !== from.market ||
      !target.officialUrl || target.officialUrl !== from.officialUrl) {
    throw new Error('같은 브랜드·제품·모델·시장·공식 링크가 확인된 작업끼리만 자료를 가져올 수 있습니다.');
  }
  const eligible = from.claims.filter(c => c.status === 'supported' && c.target !== 'competitor' &&
    from.sources.some(s => s.id === c.sourceId && s.publicationAllowed && s.externalAiAllowed && s.origin !== 'external_response'));
  const sources = from.sources.filter(s => eligible.some(c => c.sourceId === s.id));
  if (!sources.length) throw new Error('다시 검토할 수 있는 공개 허용 원문이 없습니다.');
  const sourceIds = new Map(sources.map(s => [s.id, crypto.randomUUID()]));
  return { ...target, evidenceRevision: target.evidenceRevision + 1, manualContentRequestId: null,
    sources: [...target.sources, ...sources.map(s => ({ ...s, id: sourceIds.get(s.id)!, projectId: target.id }))],
    claims: [...target.claims, ...eligible.map(c => ({ ...c, id: crypto.randomUUID(), projectId: target.id,
      sourceId: sourceIds.get(c.sourceId!)!, status: 'unreviewed' as const, reviewedBy: null, review: undefined }))],
    missingEvidence: [...target.missingEvidence, '이전 작업의 같은 모델 원문을 가져왔습니다. 현재 원문과 적용 조건을 다시 확인해야 공개 문구에 쓸 수 있습니다.'],
    documents: Object.fromEntries(Object.entries(target.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'] };
}
