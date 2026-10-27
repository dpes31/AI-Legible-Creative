import type { Project } from '../schema';
import type { DiscoveryCandidate, DiscoveryProposal, DiscoveryRun } from '../question-discovery-schema';
import { discoveryProposalSchema, discoveryResponseSchema } from '../question-discovery-schema';
import { evidenceDigest, snapshotHash } from './evidence-hash';

export function observationDigest(project: Project, rowId: string): string {
  const row = project.consumerObservations.find(r => r.id === rowId);
  const dataset = project.consumerDatasets.find(d => d.id === row?.datasetId);
  const source = project.sources.find(s => s.id === row?.evidenceLink?.sourceId);
  if (!row) return evidenceDigest(null);
  // Do not include the digest-containing link itself.
  const { evidenceLink: _link, ...original } = row;
  void _link;
  const scope = dataset ? { dataType: dataset.dataType, provider: dataset.provider, market: dataset.market,
    periodStart: dataset.periodStart, periodEnd: dataset.periodEnd, metric: dataset.metric, unit: dataset.unit,
    basis: dataset.basis, sampleScope: dataset.sampleScope, mapping: dataset.mapping, mappingVersion: dataset.mappingVersion,
    fileHash: dataset.provider === '수동 공개 발췌 장부' ? null : dataset.fileHash,
    externalAiAllowed: dataset.externalAiAllowed, publicationAllowed: dataset.publicationAllowed } : null;
  return evidenceDigest([original, scope, source ?? null]);
}
export function currentDiscoveryInput(project: Project, ids: string[]): string {
  return evidenceDigest([project.id, project.market, project.language, ids.map(id => [id, observationDigest(project, id),
    project.consumerObservations.find(r => r.id === id)?.evidenceLink ?? null])]);
}
export function discoveryRunReasons(project: Project, run: DiscoveryRun): string[] {
  const reasons: string[] = [];
  if (run.projectId !== project.id) reasons.push('다른 프로젝트의 실행입니다.');
  if (project.questionDiscoveryRuns.filter(r => r.id === run.id).length !== 1) reasons.push('실행 ID가 중복됩니다.');
  if (run.configurationHash !== discoveryConfigurationHash(run)) reasons.push('실행 모델·입력 구성·표본 기록이 바뀌었습니다.');
  if (run.status === 'stale' || run.status === 'cancelled') reasons.push('현재 사용할 수 없는 이전 실행입니다.');
  if (snapshotHash(run.input) !== run.inputHash || snapshotHash(run.prompt) !== run.promptHash)
    reasons.push('저장된 발견 입력·요청문 해시가 다릅니다.');
  if (currentDiscoveryInput(project, run.selectedRowIds) !== run.currentInputHash)
    reasons.push('원자료·출처 정보·개인정보 검토·사용 권한이 실행 당시와 다릅니다.');
  if (run.attempts.some(a => snapshotHash(a.raw) !== a.responseHash)) reasons.push('보관한 응답 원본의 해시가 다릅니다.');
  return reasons;
}
export function discoveryConfigurationHash(run: Omit<DiscoveryRun, 'configurationHash'>): string {
  return evidenceDigest([run.id, run.projectId, run.parentRunId, run.createdAt, run.mode, run.provider, run.model,
    run.modelVersion, run.modelProvenance, run.selectedRowIds, run.order, run.manifest, run.excluded,
    run.currentInputHash, run.inputHash, run.promptHash, run.rulesVersion]);
}
export function candidateDigest(candidate: DiscoveryCandidate): string {
  return evidenceDigest([candidate.id, candidate.runId, candidate.attemptId, discoveryProposalSchema.parse({
    ref: candidate.ref, text: candidate.text, provenance: candidate.provenance, evidence: candidate.evidence,
    reason: candidate.reason, alternativeInterpretations: candidate.alternativeInterpretations, context: candidate.context,
    unmetNeed: candidate.unmetNeed, decisionImpact: candidate.decisionImpact, impactReason: candidate.impactReason,
  })]);
}
export function assessDiscoveryProposal(run: DiscoveryRun, proposal: DiscoveryProposal): string[] {
  const reasons: string[] = [];
  if (run.modelProvenance === 'unknown' || ['unknown', '미확인'].includes(run.model.toLowerCase()) || ['unknown', '미확인'].includes(run.provider.toLowerCase()))
    reasons.push('실행 서비스·모델을 확인하지 못했습니다.');
  const support = proposal.evidence.filter(e => e.role === 'support');
  for (const e of proposal.evidence) {
    const row = run.manifest.find(r => r.rowId === e.rowId);
    if (!row || e.end <= e.start || row.text.slice(e.start, e.end) !== e.quote) reasons.push('전달 원문과 인용 구간·행 번호가 다릅니다.');
  }
  if (proposal.provenance !== 'hypothesis' && !support.length) reasons.push('질문을 지지하는 소비자 원문이 없습니다.');
  if (proposal.provenance === 'observed' && !support.some(e => e.quote === proposal.text)) reasons.push('실제 질문 표기와 원문 표현이 다릅니다.');
  for (const field of Object.values(proposal.context)) {
    if (field.basis === 'unknown' && field.text.trim()) reasons.push('미확인 맥락에 확정 문장이 들어 있습니다.');
    if (field.basis !== 'unknown' && (!field.text.trim() || !field.evidenceIndexes.length)) reasons.push('맥락의 인용 연결이 없습니다.');
    if (field.evidenceIndexes.some(i => !proposal.evidence[i])) reasons.push('맥락의 근거 번호가 없습니다.');
    if (field.basis === 'quote' && !field.evidenceIndexes.some(i => proposal.evidence[i]?.quote.includes(field.text))) reasons.push('직접 인용 맥락이 근거 문구에 없습니다.');
  }
  if (proposal.unmetNeed === 'explicit_barrier' && proposal.context.barrier.basis !== 'quote') reasons.push('미충족 장애를 직접 확인한 원문이 없습니다.');
  if (proposal.unmetNeed === 'conflicting' && (!support.length || !proposal.evidence.some(e => e.role === 'counter')))
    reasons.push('상충 판단의 양쪽 근거가 없습니다.');
  if (proposal.unmetNeed === 'conflicting') reasons.push('상충하는 해석은 별도 확인 전까지 보류합니다.');
  if (proposal.provenance === 'hypothesis' && proposal.unmetNeed !== 'unknown') reasons.push('탐색 가설을 미충족 수요로 확정하지 않습니다.');
  return [...new Set(reasons)];
}


export function isAcceptedDiscoveryCandidate(project: Project, candidate: DiscoveryCandidate): boolean {
  const run = project.questionDiscoveryRuns.find(r => r.id === candidate.runId);
  const attempt = run?.attempts.find(a => a.id === candidate.attemptId);
  let responseMatches = false;
  try {
    const parsed = discoveryResponseSchema.safeParse(JSON.parse(attempt?.raw || ''));
    const proposal = parsed.success ? parsed.data.questions.find(q => q.ref === candidate.ref) : null;
    responseMatches = !!proposal && parsed.success && parsed.data.runId === run?.id && parsed.data.inputHash === run?.inputHash &&
      candidateDigest({ ...candidate, ...proposal }) === candidateDigest(candidate);
  } catch { /* Invalid raw responses cannot support accepted candidates. */ }
  return responseMatches && candidate.status === 'accepted' && candidate.review?.decision === 'accepted' && candidate.holdReasons.length === 0 && !!run &&
    discoveryRunReasons(project, run).length === 0 && assessDiscoveryProposal(run, candidate).length === 0 && attempt?.status === 'review_required' &&
    candidate.review?.candidateHash === candidateDigest(candidate) && candidate.review.inputHash === run.inputHash &&
    candidate.review.note.trim().length >= 10;
}
export function revalidateDiscovery(project: Project): Project {
  const runs = project.questionDiscoveryRuns.map(run => {
    const reasons = discoveryRunReasons(project, run);
    return reasons.length && !['stale', 'cancelled'].includes(run.status) ? { ...run, status: 'stale' as const,
      events: [...run.events, { at: new Date().toISOString(), status: 'stale', reason: reasons.join(' ') }] } : run;
  });
  const current = { ...project, questionDiscoveryRuns: runs };
  return { ...current, questionCandidates: current.questionCandidates.map(c => {
    const run = runs.find(r => r.id === c.runId);
    const reasons = run ? discoveryRunReasons(current, run) : ['연결된 실행이 없습니다.'];
    if (c.status === 'accepted' && !isAcceptedDiscoveryCandidate(current, c)) reasons.push('현재 후보에 연결된 의미 검토가 없습니다.');
    return reasons.length && c.status !== 'stale' ? { ...c, status: 'stale' as const,
      holdReasons: [...new Set([...c.holdReasons, ...reasons])] } : c;
  }) };
}
