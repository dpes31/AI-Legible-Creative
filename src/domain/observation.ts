import { projectSchema, type Project } from './schema';

export type ObservationInput = Omit<Project['observations'][number], 'id' | 'at'>;

export function recordObservation(project: Project, input: ObservationInput): Project {
  if (!input.question.trim() || !input.platform.trim()) throw new Error('시험한 질문과 플랫폼을 입력해 주세요.');
  if (input.kind === 'postpublish' && input.suppliedContent) throw new Error('게시 후 일반 검색에 본문을 미리 제공한 결과를 섞을 수 없습니다. 게시 전 시험으로 기록해 주세요.');
  if (input.status === 'measured' && !input.answer.trim()) throw new Error('측정한 원본 답변을 붙여넣어 주세요.');
  if (input.status === 'failed' && (input.recommended || input.firstRecommended || input.ownedCitation || input.mention !== 'none'))
    throw new Error('실패한 요청에는 추천·언급·인용 여부를 판정하지 않습니다.');
  if (input.firstRecommended && !input.recommended) throw new Error('명시적으로 추천된 결과에서만 첫 추천을 기록할 수 있습니다.');
  if (input.ownedCitation && !input.citedUrls.length) throw new Error('실제 인용으로 제시된 공식 주소를 입력해 주세요.');
  if (input.kind === 'prepublish' && !input.suppliedContent) throw new Error('게시 전 정보 이해 시험은 제공한 자료를 표시해 주세요.');
  const entry = projectSchema.shape.observations.unwrap().element.parse({ ...input, id: crypto.randomUUID(), at: new Date().toISOString() });
  return { ...project, observations: [...project.observations, entry] };
}

export function observationSummary(project: Project, kind: 'prepublish' | 'postpublish') {
  const records = project.observations.filter(o => o.kind === kind);
  const measured = records.filter(o => o.status === 'measured');
  return { status: !records.length ? 'not_measured' as const : measured.length ? 'measured' as const : 'failed' as const,
    attempts: records.length, denominator: measured.length, failures: records.length - measured.length,
    mentions: measured.filter(o => o.mention !== 'none').length,
    recommendations: measured.filter(o => o.recommended).length,
    explicitFirst: measured.filter(o => o.firstRecommended).length,
    citations: measured.filter(o => o.ownedCitation).length };
}
