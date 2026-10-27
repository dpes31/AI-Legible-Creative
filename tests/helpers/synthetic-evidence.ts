import type { Project } from '../../src/domain/schema';
import { captureSource } from '../../src/domain/analysis/source-audit';
import { fingerprint } from '../../src/domain/text';
import { verifyClaim } from '../../src/domain/workflow';

// Only for explicitly fictitious regression specimens. Adds the source scope
// that the old tests omitted; never run this on a real product source.
export function reviewSyntheticEvidence(project: Project, claimIds = project.claims.filter(c => c.status === 'supported').map(c => c.id)): Project {
  let p = structuredClone(project);
  for (const id of claimIds) {
    const claim = p.claims.find(c => c.id === id)!;
    const source = p.sources.find(s => s.id === claim.sourceId)!;
    if (source.url?.includes('coway.com') || source.url?.includes('puliodays.com')) throw new Error('Real sources must not use synthetic provenance.');
    claim.conditions ||= '허구 시험 조건';
    if (!claim.quote.includes(claim.conditions)) claim.quote = claim.conditions + ' ' + claim.quote;
    if (!source.body.includes(claim.subject)) source.body = claim.subject + '\n' + source.body;
    if (!source.body.includes(claim.quote)) source.body += '\n' + claim.quote;
    source.url ||= 'https://example.test/synthetic-source'; source.hash = fingerprint(source.body);
    const captured = captureSource(source, { method: 'manual_excerpt', locator: '허구 회귀 시험 전체 구간', coverage: 'excerpt',
      modelScope: [claim.subject], conditionScope: [claim.conditions], interest: '허구 fixture, 실제 소비자·상품 아님' });
    p = { ...p, sources: p.sources.map(s => s.id === source.id ? captured : s) };
    p = verifyClaim(p, id, '허구 회귀 자료의 사실과 조건을 확인합니다. 실제 상품 성능·소비자 분석의 근거가 아닙니다.');
  }
  return p;
}
