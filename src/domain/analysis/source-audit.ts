import { sha256 } from '@noble/hashes/sha2.js';
import type { Claim, Project, Source, SourceSnapshot } from '../schema';
import { fingerprint, normalize } from '../text';

export function snapshotHash(text: string): string {
  return 'sha256:' + Array.from(sha256(new TextEncoder().encode(text)), n => n.toString(16).padStart(2, '0')).join('');
}

function sourceMetadata(source: Source): NonNullable<SourceSnapshot['sourceMetadata']> {
  return { sourceType: source.sourceType, publisher: source.publisher ?? null, title: source.title,
    origin: source.origin, fileName: source.fileName ?? null, duplicateGroupId: source.duplicateGroupId ?? null };
}
function metadataFields(metadata: SourceSnapshot['sourceMetadata']) {
  return metadata ? [metadata.sourceType, metadata.publisher, metadata.title, metadata.origin,
    metadata.fileName, metadata.duplicateGroupId] : null;
}

// A digest binds saved bytes, not the publisher's identity or the truth of a claim.
// Metadata is a collector declaration, never an independent authenticity check.
export function captureSource(source: Source, details: Pick<SourceSnapshot,
  'method' | 'locator' | 'coverage' | 'modelScope' | 'conditionScope' | 'interest'>): Source {
  const snapshot: SourceSnapshot = { ...details, id: crypto.randomUUID(), text: source.body,
    sha256: snapshotHash(source.body), url: source.url, capturedAt: source.collectedAt,
    publishedAt: source.publishedAt, retrieval: source.retrieval, sourceMetadata: sourceMetadata(source) };
  return { ...source, snapshots: [...(source.snapshots || []), snapshot], activeSnapshotId: snapshot.id };
}

export function inspectSource(source: Source, quote: string) {
  const snapshot = source.snapshots?.find(item => item.id === source.activeSnapshotId);
  const reasons: string[] = [];
  if (new Set(source.snapshots?.map(item => item.id)).size !== (source.snapshots?.length || 0))
    reasons.push('스냅샷 ID가 중복되어 수집 이력을 확인할 수 없습니다.');
  const hashMatches = !!source.body && fingerprint(source.body) === source.hash;
  const snapshotMatches = !!snapshot && snapshot.sha256 === snapshotHash(snapshot.text) &&
    snapshot.sha256 === snapshotHash(source.body) && snapshot.text === source.body;
  const originalAvailable = source.origin !== 'external_response' && !!source.body.trim() && source.retrieval !== 'failed';
  const quoteFound = !!quote.trim() && normalize(source.body).includes(normalize(quote));
  if (!originalAvailable) reasons.push('원문 수집 실패 또는 외부 AI 발췌만 존재합니다.');
  if (!hashMatches) reasons.push('현재 원문과 저장 해시가 다릅니다.');
  if (!quoteFound) reasons.push('저장 원문에서 인용 구간을 찾지 못했습니다.');
  if (!snapshot) reasons.push('SHA-256 수집 스냅샷이 없습니다. 기존 자료를 원출처와 재대조해 주세요.');
  else {
    if (!snapshot.sourceMetadata)
      reasons.push('출처 분류·발행자 수집 기록이 없습니다. 원출처와 재대조해 주세요.');
    else if (JSON.stringify(metadataFields(snapshot.sourceMetadata)) !== JSON.stringify(metadataFields(sourceMetadata(source))))
      reasons.push('출처 분류·발행자 등 메타데이터가 수집 기록과 다릅니다. 원출처와 재대조해 주세요.');
    if (!snapshotMatches)
      reasons.push('SHA-256 스냅샷과 저장 원문이 다릅니다.');
    if (snapshot.url !== source.url || snapshot.capturedAt !== source.collectedAt ||
      snapshot.retrieval !== source.retrieval || snapshot.publishedAt !== source.publishedAt)
      reasons.push('수집 증적과 현재 출처 정보가 다릅니다.');
    if (!snapshot.url || !snapshot.locator.trim() || snapshot.coverage === 'unknown')
      reasons.push('출처 URL 또는 확보한 본문 범위를 확인하지 못했습니다.');
    if (snapshot.retrieval === 'failed') reasons.push('스냅샷의 수집 결과가 실패입니다.');
  }
  return { hashMatches, snapshotMatches, originalAvailable, quoteFound, snapshot, reasons,
    state: reasons.length ? 'hold' as const : 'needs_semantic_review' as const };
}

// Conservative exact value/unit matching. No unit conversion or efficacy inference.
export function quantities(text: string): string[] {
  const withoutModels = text.replace(/\b[A-Z]{1,8}-[A-Z0-9-]+\b/gi, '');
  return [...withoutModels.normalize('NFKC').matchAll(/\d+(?:[.,]\d+)?\s*(?:%|mm|cm|km|mL|ml|kg|L|g|m|도|°|시간|분|단계|가지|대|회|개|원|배|년|월|일)(?![A-Za-z])/g)]
    .map(match => match[0].replace(/\s/g, ''));
}
export function claimFingerprint(claim: Claim): string {
  return snapshotHash(JSON.stringify([claim.statement, claim.quote, claim.subject, claim.conditions, claim.sourceId, claim.target]));
}
export function sourceSnapshotFingerprint(snapshot: SourceSnapshot | undefined): string {
  return snapshotHash(JSON.stringify(snapshot ? [snapshot.id, snapshot.text, snapshot.sha256, snapshot.url,
    snapshot.capturedAt, snapshot.publishedAt, snapshot.retrieval, snapshot.method, snapshot.locator,
    snapshot.coverage, snapshot.modelScope, snapshot.conditionScope, snapshot.interest,
    metadataFields(snapshot.sourceMetadata)] : null));
}

export function inspectClaim(project: Project, claim: Claim) {
  const source = project.sources.find(item => item.id === claim.sourceId && item.projectId === project.id);
  if (!source) return { state: 'hold' as const, reasons: ['연결된 원문 출처가 없습니다.'], snapshotId: undefined };
  const check = inspectSource(source, claim.quote);
  const reasons = [...check.reasons];
  if (claim.target === 'unresolved') reasons.push('이 주장의 제품 범위를 아직 확정하지 않았습니다.');
  const snapshot = check.snapshot;
  const inQuote = new Set(quantities(claim.quote));
  if (quantities(claim.statement + ' ' + claim.conditions).some(value => !inQuote.has(value)))
    reasons.push('주장과 인용의 수치·단위가 다릅니다.');
  const scoped = snapshot?.modelScope.some(model => normalize(model) === normalize(claim.subject) &&
    normalize(source.body).includes(normalize(model)));
  if (!claim.subject.trim() || !scoped) reasons.push('원문에서 적용 모델·제품 범위를 확인하지 못했습니다.');
  const modelTokens: string[] = claim.subject.match(/[A-Z0-9]+(?:-[A-Z0-9]+)+/gi) || [];
  const quoteModels: string[] = claim.quote.match(/[A-Z0-9]+(?:-[A-Z0-9]+)+/gi) || [];
  if (modelTokens.some(model => !quoteModels.includes(model)))
    reasons.push('해당 인용 구간에서 적용 모델 코드를 확인하지 못했습니다.');
  if (project.model && claim.target !== 'competitor' && !(modelTokens.includes(project.model) ||
    (!/[A-Z0-9]+(?:-[A-Z0-9]+)+/i.test(project.model) && normalize(claim.subject).split(' ').includes(project.model))))
    reasons.push('현재 모델과 주장의 적용 모델이 다릅니다.');
  const stripModel = (text: string) => text.replaceAll(claim.subject, '').replace(/\b[A-Z]{1,8}-[A-Z0-9-]+\b/gi, '');
  const numbers = (text: string) => [...stripModel(text).matchAll(/\d+(?:[.,]\d+)?/g)].map(match => match[0]);
  if (numbers(claim.statement + ' ' + claim.conditions).some(value => !numbers(claim.quote).includes(value)))
    reasons.push('주장의 숫자가 원문 인용에 없습니다.');
  const numericText = stripModel(claim.statement + ' ' + claim.conditions).normalize('NFKC');
  const known = quantities(numericText);
  let residual = numericText.replace(/\s/g, '');
  for (const quantity of known) residual = residual.replace(quantity, '');
  if (/\d/.test(residual)) reasons.push('수치의 단위가 없거나 자동 대조가 지원하지 않는 표기입니다.');
  if (!claim.conditions.trim() || !snapshot?.conditionScope.some(condition => normalize(condition) === normalize(claim.conditions)) ||
      !normalize(claim.quote).includes(normalize(claim.conditions)))
    reasons.push('적용 조건이 없거나 인용에서 확인되지 않습니다.');
  const semanticReviewed = claim.review?.method === 'human' && (claim.review.note?.trim().length || 0) >= 10 &&
    claim.review.snapshotId === snapshot?.id && claim.review.snapshotHash === sourceSnapshotFingerprint(snapshot) &&
    claim.review.claimHash === claimFingerprint(claim) &&
    claim.review.sourceHash === source.hash && claim.review.quote === claim.quote;
  return { state: reasons.length ? 'hold' as const : semanticReviewed ? 'verified' as const : 'needs_semantic_review' as const,
    reasons, snapshotId: snapshot?.id };
}
export function isVerifiedClaim(project: Project, claim: Claim): boolean {
  return claim.status === 'supported' && inspectClaim(project, claim).state === 'verified';
}

// Recompute on load, save and analysis use. Never trust a serialized "supported".
// Preserve original text, prior review and the reason for demotion.
export function revalidateEvidence(project: Project): Project {
  let demoted = false;
  const claims = project.claims.map(claim => {
    const check = inspectClaim(project, claim);
    if (check.state !== 'hold' && (claim.status !== 'supported' || check.state === 'verified')) return claim;
    const reasons = check.state === 'hold' ? check.reasons : ['현재 원문·주장에 연결된 의미 검토 기록이 없습니다.'];
    if (claim.status === 'contradicted') return claim;
    if (claim.status === 'supported') demoted = true;
    const same = JSON.stringify(claim.evidenceHold?.reasons) === JSON.stringify(reasons);
    const externalCandidate = claim.status === 'unreviewed' &&
      project.sources.some(source => source.id === claim.sourceId && source.origin === 'external_response');
    return { ...claim, status: externalCandidate ? 'unreviewed' as const : 'insufficient' as const, evidenceHold: same ? claim.evidenceHold : {
      reasons, checkedAt: new Date().toISOString(), previousStatus: claim.evidenceHold?.previousStatus || claim.status } };
  });
  const answerPlans = project.answerPlans.map(plan => {
    if (plan.reviewStatus !== 'reviewed' || !plan.claimIds.some(id =>
      !claims.some(claim => claim.id === id && isVerifiedClaim({ ...project, claims }, claim)))) return plan;
    demoted = true;
    return { ...plan, reviewStatus: 'proposed' as const };
  });
  const unsafeDocument = Object.values(project.documents).some(doc => doc?.status === 'ready' &&
    doc.blocks.some(block => block.claimRefs.some(id => !claims.some(claim => claim.id === id && isVerifiedClaim({ ...project, claims }, claim)))));
  return { ...project, claims, answerPlans, ...(demoted || unsafeDocument ? {
    evidenceRevision: project.evidenceRevision + 1, manualResearchRequestId: null, manualContentRequestId: null,
    insight: { ...project.insight, approval: 'pending' as const, approvedAt: null },
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'],
  } : {}) };
}
