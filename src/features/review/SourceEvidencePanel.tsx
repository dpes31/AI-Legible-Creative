'use client';
import { useState } from 'react';
import type { Project, Source } from '@/domain/schema';
import { inspectClaim, inspectSource } from '@/domain/analysis/source-audit';
import { addEvidenceClaim, recordSourceSnapshot } from '@/domain/analysis/evidence-intake';

export function SourceEvidencePanel({ project, source, update, onError }: {
  project: Project; source: Source; update: (p: Project) => void; onError: (message: string) => void;
}) {
  const current = source.snapshots?.find(item => item.id === source.activeSnapshotId);
  const [locator, setLocator] = useState(current?.locator || '');
  const [models, setModels] = useState(current?.modelScope.join('\n') || '');
  const [conditions, setConditions] = useState(current?.conditionScope.join('\n') || '');
  const [statement, setStatement] = useState(''); const [quote, setQuote] = useState('');
  const [subject, setSubject] = useState(project.model ? `${project.name} ${project.model}` : project.name);
  const [claimCondition, setClaimCondition] = useState('');
  const check = inspectSource(source, source.body || source.excerpt);
  const act = (action: () => Project) => { try { update(action()); onError(''); } catch (error) { onError(error instanceof Error ? error.message : '자료를 저장하지 못했습니다.'); } };
  return <details><summary>저장된 원문과 수집 증적</summary>
    <p className="small">수집 시각: {source.collectedAt} · 게시일: {source.publishedAt || '미확인'} · 수집 결과: {source.retrieval}</p>
    <p className="small">현재 출처 분류: {source.sourceType} · 발행자: {source.publisher || '미확인'}</p>
    <p className="small">수집 당시 출처 분류: {current?.sourceMetadata?.sourceType || '기록 없음'} · 발행자: {current?.sourceMetadata ? current.sourceMetadata.publisher || '미확인' : '기록 없음'}</p>
    <p className="small">수집 범위: {current?.locator || '미확인'} · {current?.coverage || 'unknown'} · 이해관계: {current?.interest || '미확인'}</p>
    <p className="small">본문 무결성: {check.hashMatches && check.snapshotMatches ? '저장 원문과 SHA-256 스냅샷 일치' : '보류'}</p>
    <p className="small">수집 증적·출처 대조: {check.state === 'hold' ? '보류' : '입력 기록 일치 · 발행자 진위 인증 아님'}</p>
    {check.reasons.map(reason => <p key={reason} className="small">{reason}</p>)}
    <p className="small muted">해시 일치는 출처 진위·주장 의미의 승인이 아닙니다. 부분 원문 밖의 정보는 판단하지 않습니다.</p>
    <pre className="output">{source.body || source.excerpt || '저장된 본문 없음'}</pre>
    {source.snapshots?.map(snapshot => <p className="small source-link" key={snapshot.id}>스냅샷 {snapshot.id} · {snapshot.sha256} · {snapshot.capturedAt}</p>)}
    <details><summary>원출처 재대조 후 수집 범위 기록</summary>
      <p className="small muted">실제 원문과 대조한 구간만 기록합니다. 새 스냅샷은 이전 기록을 삭제하지 않습니다.</p>
      <label className="field">확보한 본문 구간<input value={locator} onChange={e => setLocator(e.target.value)} /></label>
      <label className="field">원문에 확인된 적용 모델·제품 (줄별)<textarea value={models} onChange={e => setModels(e.target.value)} /></label>
      <label className="field">원문에 확인된 적용 조건 (줄별)<textarea value={conditions} onChange={e => setConditions(e.target.value)} /></label>
      <button type="button" className="button secondary" onClick={() => act(() => recordSourceSnapshot(project, source.id, {
        method: 'manual_excerpt', locator, coverage: 'excerpt', interest: current?.interest || '미확인',
        modelScope: models.split('\n').map(v => v.trim()).filter(Boolean), conditionScope: conditions.split('\n').map(v => v.trim()).filter(Boolean),
      }))}>수집 범위와 새 스냅샷 저장</button>
    </details>
    <details><summary>이 원문에 주장 연결</summary>
      <p className="small muted">검증할 주장입니다. 소비자 질문이나 니즈를 발견한 결과로 사용하지 않습니다.</p>
      <label className="field">검증할 주장<textarea value={statement} onChange={e => setStatement(e.target.value)} /></label>
      <label className="field">정확한 원문 인용<textarea value={quote} onChange={e => setQuote(e.target.value)} /></label>
      <label className="field">주장의 적용 모델·제품<input value={subject} onChange={e => setSubject(e.target.value)} /></label>
      <label className="field">주장의 적용 조건<input value={claimCondition} onChange={e => setClaimCondition(e.target.value)} /></label>
      <button type="button" className="button secondary" onClick={() => act(() => addEvidenceClaim(project, source.id,
        { statement, quote, subject, conditions: claimCondition }))}>주장을 검토 대상으로 저장</button>
    </details>
    {project.claims.filter(claim => claim.sourceId === source.id).map(claim => <p key={claim.id} className="small">
      {claim.statement} · {inspectClaim(project, claim).state === 'verified' && claim.status === 'supported' ? '의미 검토 기록 있음' : '검토 또는 보류'}
    </p>)}
  </details>;
}
