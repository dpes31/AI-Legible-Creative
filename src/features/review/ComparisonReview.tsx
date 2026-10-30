'use client';
import { useState } from 'react';
import { type Comparison, type Project } from '@/domain/schema';
import { confirmComparison } from '@/domain/workflow';
import { comparisonAssessment } from '@/domain/analysis/strategy';

export function ComparisonReview({ project, comparison, update, onError }: { project: Project; comparison: Comparison; update: (p: Project) => void; onError: (s: string) => void }) {
  const [conditions, setConditions] = useState(comparison.review?.conditions || '');
  const [asOf, setAsOf] = useState(comparison.review?.asOf || '');
  const [reason, setReason] = useState(comparison.review ? comparison.reason : '');
  const [verdict, setVerdict] = useState<'advantage' | 'common' | 'weakness'>('common');
  const assessment = comparisonAssessment(project, comparison);
  return <div className="document-block"><h3>{comparison.competitor} · {comparison.criterion}</h3><span className="badge warn">{assessment.label}</span>
    <div className="grid"><div><strong className="small">자사 근거</strong>{comparison.ownClaimIds.map(id => <p className="small" key={id}>{project.claims.find(c => c.id === id)?.statement || '확인할 근거 없음'}</p>)}</div>
      <div><strong className="small">경쟁 제품 근거</strong>{comparison.otherClaimIds.length ? comparison.otherClaimIds.map(id => <p className="small" key={id}>{project.claims.find(c => c.id === id)?.statement || '확인할 근거 없음'}</p>) : <p className="small muted">자료를 찾지 못했습니다. 기능이 없다는 뜻은 아닙니다.</p>}</div></div>
    <p className="small muted">{assessment.reason}</p>
    <details><summary>같은 조건인지 직접 확인하기</summary>
      <div className="field"><label htmlFor={`compare-condition-${comparison.id}`}>같은 기준으로 비교한 조건</label><input id={`compare-condition-${comparison.id}`} value={conditions} onChange={e => setConditions(e.target.value)} placeholder="모델·시험 조건 또는 구매/렌탈·기간·할인 조건" /></div>
      <div className="field"><label htmlFor={`compare-date-${comparison.id}`}>비교 기준 날짜</label><input id={`compare-date-${comparison.id}`} type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></div>
      <div className="field"><label htmlFor={`compare-verdict-${comparison.id}`}>양쪽 자료로 확인한 차이</label><select id={`compare-verdict-${comparison.id}`} value={verdict} onChange={e => setVerdict(e.target.value as typeof verdict)}><option value="common">두 제품의 공통 장점</option><option value="advantage">이 조건에서 자사가 앞섬</option><option value="weakness">이 조건에서 자사가 부족함</option></select></div>
      <div className="field"><label htmlFor={`compare-reason-${comparison.id}`}>판단 이유와 한계</label><textarea id={`compare-reason-${comparison.id}`} value={reason} onChange={e => setReason(e.target.value)} /></div>
      <button className="button secondary" type="button" onClick={() => { try { update(confirmComparison(project, comparison.id, { verdict, conditions, asOf, reason })); onError(''); } catch (error) { onError(error instanceof Error ? error.message : '비교 조건을 확인해 주세요.'); } }}>비교 판단 기록하기</button>
    </details>
  </div>;
}
