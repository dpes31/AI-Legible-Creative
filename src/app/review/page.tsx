'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { attachOriginalText, rejectClaim, verifyClaim } from '@/domain/workflow';
import { AnalysisSummary } from '@/features/review/AnalysisSummary';
import { ComparisonReview } from '@/features/review/ComparisonReview';
import { SourceForm } from '@/features/review/SourceForm';
import { ManualExchange } from '@/features/manual/ManualExchange';
import styles from '@/features/review/Review.module.css';

export default function ReviewPage() {
  const { project, loading, update } = useWorkspace();
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [publication, setPublication] = useState<Record<string, boolean>>({});
  if (loading) return <p role="status">작업을 불러오는 중입니다…</p>;
  if (!project) return <div className="card"><h1>먼저 알릴 대상을 정해 주세요.</h1><Link className="button" href="/">정보 입력하기</Link></div>;
  const hasAnalysis = !!(project.claims.length || project.questions.length || project.recommendations.length);
  const unreviewed = project.claims.filter(c => c.status !== 'supported').length;
  const confirmClaim = (id: string) => {
    try { update(verifyClaim(project, id)); setError(''); setNotice('원문과 주장을 직접 대조한 기록을 남겼습니다.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '원문을 확인할 수 없습니다.'); }
  };
  return <>
    <section className="hero"><div className="eyebrow">2. 분석 확인</div><h1>브랜드 분석: {project.name}</h1>
      <p className="muted">고객에게 필요한 이유와, 그 이유를 뒷받침할 근거를 살펴보세요.</p></section>
    {project.migrationNote && <details className="notice-details"><summary>가져온 자료에서 확인할 사항</summary><p className="small muted">{project.migrationNote}</p></details>}
    {error && <p className="alert" role="alert">{error}</p>}
    {notice && <p className="small muted" role="status">{notice}</p>}
    {hasAnalysis ? <>
      <AnalysisSummary project={project} />
      <div className={styles.next}><p>{unreviewed ? `원문 확인이 필요한 주장이 ${unreviewed}개 있습니다. 미확인 사실을 제외하고 문구를 만들 수도 있어요.` : '확인한 사실을 채널에 맞게 다듬을 수 있습니다.'}</p><Link href="/results" className="button">근거 확인 후 문구 만들기 <span aria-hidden="true">→</span></Link></div>
    </> : <section className="card"><span className="eyebrow">첫 번째 요청 · 조사</span><h2>어떤 점을 알리면 좋을지 찾아봅니다.</h2><ManualExchange project={project} stage="research" update={update} onError={setError} onNotice={setNotice} /></section>}
    <details className={styles.fold} id="evidence"><summary>근거 확인하기 <span>주장 {project.claims.length}개 · 원문 확인 필요 {unreviewed}개</span></summary>
      {!project.claims.length && <p className="muted">조사 응답을 가져오면 문장별 출처와 조건을 함께 볼 수 있습니다.</p>}
      {project.claims.map(claim => { const source = project.sources.find(s => s.id === claim.sourceId);
        const label = claim.status === 'supported' ? '직접 대조함' : claim.status === 'contradicted' ? '상충하는 근거' : claim.status === 'insufficient' ? '근거 부족' : '원문 확인 필요';
        return <article className={styles.claim} key={claim.id}><h3>{claim.statement}</h3><span className={claim.status === 'supported' ? 'badge' : 'badge warn'}>{label}</span>
          <p className="small muted">대상: {claim.subject || '확인 필요'} · {source?.title || '출처 없음'}{source?.sourceType === 'official' ? ' · 공식 자료 기재' : source?.sourceType === 'review' ? ' · 개인 경험' : ''}</p>
          {claim.conditions && <p className="small">적용 조건: {claim.conditions}</p>}
          {claim.quote && <blockquote>{claim.quote}</blockquote>}
          {source?.url && <a href={source.url} target="_blank" rel="noreferrer" className="source-link">원문 링크 열기 ↗</a>}
          {source?.origin === 'external_response' && <div className="field"><label htmlFor={`original-${claim.id}`}>AI가 제시한 인용문입니다. 실제 원문을 열어 본문을 붙여넣어 주세요.</label>
            <textarea id={`original-${claim.id}`} value={originals[source.id] || ''} onChange={e => setOriginals(old => ({ ...old, [source.id]: e.target.value }))} />
            <label className="row"><input type="checkbox" checked={publication[source.id] || false} onChange={e => setPublication(old => ({ ...old, [source.id]: e.target.checked }))} />공개 문구의 근거로 사용해도 됩니다</label>
            <button type="button" className="button secondary" onClick={() => {
              try { update(attachOriginalText(project, source.id, originals[source.id] || '', publication[source.id] || false)); setError(''); setNotice('원문을 연결했습니다. 이 문장이 실제 주장을 뒷받침하는지 확인해 주세요.'); }
              catch (cause) { setError(cause instanceof Error ? cause.message : '원문을 확인하지 못했어요.'); }
            }}>원문 연결하기</button>
          </div>}
          {source && source.origin !== 'external_response' && <details><summary>저장한 원문 확인</summary><pre className="output">{source.body}</pre></details>}
          {claim.status !== 'supported' && source && source.origin !== 'external_response' && <p><button type="button" className="button secondary" onClick={() => confirmClaim(claim.id)}>원문과 직접 대조했어요</button></p>}
          <div className="row small"><button className="button text" type="button" onClick={() => { update(rejectClaim(project, claim.id, 'insufficient')); setNotice('이 주장은 근거 부족으로 보류합니다.'); }}>근거가 부족해요</button>
            <button className="button text" type="button" onClick={() => { update(rejectClaim(project, claim.id, 'contradicted')); setNotice('상충하는 주장으로 기록했습니다. 작성에 사용하지 않습니다.'); }}>원문과 맞지 않아요</button></div>
        </article>;
      })}
    </details>
    <details className={styles.fold}><summary>고객 질문과 경쟁 비교 <span>질문 {project.questions.length}개 · 비교 {project.comparisons.length}개</span></summary>
      <h3>고객이 궁금해하는 것</h3>{project.questions.length ? <ul className="list">{project.questions.map(q => <li key={q.id}>{q.text} <span className="badge">{q.provenance === 'observed' ? '관찰' : q.provenance === 'reconstructed' ? '자료로 재구성' : '가설'}</span></li>)}</ul> : <p className="small muted">아직 조사한 질문이 없습니다.</p>}
      <h3>경쟁 제품과 같은 점·다른 점</h3>{project.comparisons.length ? project.comparisons.map(c => <ComparisonReview key={c.id} project={project} comparison={c} update={update} onError={setError} />) : <p className="small muted">비교할 자료가 없습니다. 자사 특징만으로 우위를 판단하지 않습니다.</p>}
    </details>
    <details className={styles.fold}><summary>자료 더하기 <span>저장한 자료 {project.sources.length}개 · TXT, MD, PDF</span></summary><SourceForm key={project.id} project={project} update={update} setError={setError} setNotice={setNotice} /></details>
    {hasAnalysis && <details className={styles.fold} open={!!project.manualResearchRequestId}><summary>조사 보완하기 <span>새 자료나 질문이 있을 때</span></summary><ManualExchange project={project} stage="research" update={update} onError={setError} onNotice={setNotice} /></details>}
    {!hasAnalysis && <div className={styles.next}><p>자료가 부족하면 기능·수치 없는 구성안부터 만들 수 있습니다.</p><Link href="/results" className="button secondary">자료 보완용 구성안 만들기</Link></div>}
  </>;
}
