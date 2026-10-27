'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { attachOriginalText, prepareContent, rejectClaim, verifyClaim } from '@/domain/workflow';
import { AnalysisSummary } from '@/features/review/AnalysisSummary';
import { ComparisonReview } from '@/features/review/ComparisonReview';
import { SourceForm } from '@/features/review/SourceForm';
import { ConsumerDataForm } from '@/features/review/ConsumerDataForm';
import { QuestionDiscoveryPanel } from '@/features/review/QuestionDiscoveryPanel';
import { inspectClaim, revalidateEvidence } from '@/domain/analysis/source-audit';
import { questionEvidenceLabel } from '@/domain/consumer-data';
import { ManualExchange } from '@/features/manual/ManualExchange';
import { approveInsight, hasUsableEvidence, insightCurrent, reviseInsight } from '@/domain/insight';
import styles from '@/features/review/Review.module.css';

export default function ReviewPage() {
  const { project, loading, update, flush } = useWorkspace();
  const router = useRouter();
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [insightError, setInsightError] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [semanticNotes, setSemanticNotes] = useState<Record<string, string>>({});
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [publication, setPublication] = useState<Record<string, boolean>>({});
  if (loading) return <p role="status">작업을 불러오는 중입니다…</p>;
  if (!project) return <div className="card"><h1>먼저 알릴 대상을 정해 주세요.</h1><Link className="button" href="/">정보 입력하기</Link></div>;
  const hasAnalysis = !!(project.claims.length || project.questions.length || project.recommendations.length);
  const unreviewed = project.claims.filter(c => c.status !== 'supported').length;
  const usableEvidence = hasUsableEvidence(project);
  const draftCandidates = project.claims.filter(c => c.status === 'unreviewed' && c.target === 'own' && !!c.quote &&
    project.sources.some(s => s.id === c.sourceId && !!s.excerpt && s.externalAiAllowed)).length;
  const sourceGroups = project.sources.filter(s => s.origin === 'external_response').filter((source, index, sources) =>
    sources.findIndex(item => item.id === source.id || (source.url && source.url === item.url &&
      source.duplicateGroupId === item.duplicateGroupId && source.collectedAt === item.collectedAt &&
      source.publishedAt === item.publishedAt)) === index);
  const continueToWriting = async (outline: boolean) => {
    if (advancing) return;
    setAdvancing(true);
    try {
      const approved = approveInsight(project, outline);
      const prepared = prepareContent(approved, project.selectedChannels);
      update(prepared.project);
      await flush();
      setInsightError(''); setError('');
      router.push('/results');
    } catch (cause) {
      setInsightError(cause instanceof Error ? cause.message : '작성 요청문을 만들지 못했어요. 다시 시도해 주세요.');
    } finally { setAdvancing(false); }
  };
  const confirmClaim = (id: string) => {
    try { update(verifyClaim(project, id, semanticNotes[id] || '')); setError(''); setNotice('원문과 주장을 직접 대조한 기록을 남겼습니다.'); }
    catch (cause) { update(revalidateEvidence(project)); setError(cause instanceof Error ? cause.message : '원문을 확인할 수 없습니다.'); }
  };
  return <>
    <section className="hero"><div className="eyebrow">2. 분석 확인</div><h1>브랜드 분석: {project.name}</h1>
      <p className="muted">고객에게 필요한 이유와, 그 이유를 뒷받침할 근거를 살펴보세요.</p></section>
    {project.migrationNote && <details className="notice-details"><summary>가져온 자료에서 확인할 사항</summary><p className="small muted">{project.migrationNote}</p></details>}
    {error && <p className="alert" role="alert">{error}</p>}
    {notice && <p className="small muted" role="status">{notice}</p>}
    <section className="card">
      {hasAnalysis ? <details><summary>소비자·검색 자료 보완</summary><ConsumerDataForm project={project} update={update} /></details>
        : <ConsumerDataForm project={project} update={update} />}
    </section>
    {hasAnalysis ? <>
      <AnalysisSummary project={project} />
      <section className="card" aria-labelledby="insight-review-heading"><h2 id="insight-review-heading">핵심 인사이트 검수</h2>
        <p className="small muted">질문·소구 순서·채널별 방향을 바꾸고 싶다면 적어 주세요. 새로운 기능이나 수치는 근거를 확인한 뒤에만 본문에 넣습니다.</p>
        <div className="field"><label htmlFor="insight-feedback">수정할 방향</label><textarea id="insight-feedback" value={project.insight.feedback}
          onChange={event => { setInsightError(''); update(reviseInsight(project, event.target.value)); }} placeholder="예: 허리 지지보다 공간 활용을 먼저 설명해 주세요. 등·허리 안마는 일반형에만 해당한다고 밝혀 주세요." /></div>
        {/(?:\d\s*(?:%|mm|cm|원|배)|인증|유일|최고|더\s*좋)/.test(project.insight.feedback) &&
          <p className="small muted">새로운 수치·효능·우위가 의견에 있다면 근거 후보로만 보관합니다. 확인한 주장에 없는 내용은 요청문에서 사실로 쓰지 않습니다.</p>}
        <p className="small muted">수정 의견은 자동으로 저장됩니다. 아래 자료와 질문을 살펴본 뒤 페이지 맨 아래에서 작성 방식을 선택해 주세요.</p>
        {insightCurrent(project) && <p role="status" className="small">승인한 방향 {project.insight.revision} · 입력 {project.insight.inputRevision} · 근거 {project.insight.evidenceRevision} 버전</p>}
      </section>
    </> : <section className="card"><span className="eyebrow">첫 번째 요청 · 조사</span><h2>어떤 점을 알리면 좋을지 찾아봅니다.</h2><ManualExchange project={project} stage="research" update={update} onError={setError} onNotice={setNotice} /></section>}
    <details className={styles.fold} id="evidence" tabIndex={-1}><summary>자료와 근거 살펴보기 <span>출처 {project.sources.length}건 · 검토할 주장 {unreviewed}개</span></summary>
      <p className="small muted">아래 인용은 외부 AI가 제안한 확인 후보입니다. 출처별 원문 연결은 선택 작업이며 작성 요청문을 먼저 만들 수 있습니다. 미확인 사실은 검토용 초안에만 사용합니다.</p>
      {sourceGroups.map(source => <section className={styles.claim} key={source.id}>
        <h3>{source.title}</h3><p className="small muted">같은 주소의 발췌를 한 번에 확인합니다. 원문 연결은 인용문 존재 검사이며 사실의 의미 검증이 아닙니다.</p>
        {source.url && <a href={source.url} target="_blank" rel="noreferrer" className="source-link">자료 열기 ↗</a>}
        <div className="field"><label htmlFor={`original-${source.id}`}>이 출처의 실제 본문 또는 관련 원문 구간</label>
          <textarea id={`original-${source.id}`} value={originals[source.id] || ''} onChange={e => setOriginals(old => ({ ...old, [source.id]: e.target.value }))} />
          <label className="row"><input type="checkbox" checked={publication[source.id] || false} onChange={e => setPublication(old => ({ ...old, [source.id]: e.target.checked }))} />공개 문구의 근거로 사용할 권한이 있습니다</label>
          <button type="button" className="button secondary" onClick={() => {
            try { update(attachOriginalText(project, source.id, originals[source.id] || '', publication[source.id] || false)); setError(''); setNotice('같은 출처의 원문을 연결했습니다. 인용 일치와 의미 확인 결과는 구분됩니다.'); }
            catch (cause) { setError(cause instanceof Error ? cause.message : '원문을 확인하지 못했어요.'); }
          }}>이 출처 한 번 연결하기</button>
        </div>
      </section>)}
      {!project.claims.length && <p className="muted">조사 응답을 가져오면 문장별 출처와 조건을 함께 볼 수 있습니다.</p>}
      {project.claims.map(claim => { const source = project.sources.find(s => s.id === claim.sourceId);
        const check = inspectClaim(project, claim);
        const label = claim.status === 'supported' && check.state === 'verified' ? '자동 대조 + 사람 의미 검토 기록' : check.state === 'hold' ? '검증 보류' : claim.status === 'contradicted' ? '상충하는 근거' : claim.status === 'insufficient' ? '근거 부족' : '원문 확인 필요';
        return <article className={styles.claim} key={claim.id}><h3>{claim.statement}</h3><span className={claim.status === 'supported' ? 'badge' : 'badge warn'}>{label}</span>
          <p className="small muted">대상: {claim.subject || '확인 필요'} · {source?.title || '출처 없음'}{source?.sourceType === 'official' ? ' · 공식 자료 기재' : source?.sourceType === 'review' ? ' · 개인 경험' : ''}</p>
          {check.reasons.map(reason => <p className="small" key={reason}>보류: {reason}</p>)}
          {claim.evidenceHold?.reasons.filter(reason => !check.reasons.includes(reason)).map(reason => <p className="small" key={reason}>보류 기록: {reason}</p>)}
          {claim.review?.note && <p className="small">의미 검토 기록: {claim.review.note}</p>}
          {claim.conditions && <p className="small">적용 조건: {claim.conditions}</p>}
          {claim.quote && <blockquote>{claim.quote}</blockquote>}
          {source?.url && <a href={source.url} target="_blank" rel="noreferrer" className="source-link">원문 링크 열기 ↗</a>}
          {source && source.origin !== 'external_response' && <details><summary>저장한 원문 확인</summary><pre className="output">{source.body}</pre></details>}
          {claim.status !== 'supported' && source && source.origin !== 'external_response' && <details><summary className="small">이 주장의 의미와 모델 조건 검토</summary><p className="small">자동 검사는 수집 증적·저장 무결성·명시 사실만 대조합니다. 주장 의미와 과장 여부는 따로 확인해 주세요.</p><label className="field">의미 검토 이유와 한계<textarea value={semanticNotes[claim.id] || ''} onChange={e => setSemanticNotes(old => ({ ...old, [claim.id]: e.target.value }))} /></label><button type="button" className="button secondary" onClick={() => confirmClaim(claim.id)}>원문과 의미를 직접 대조했어요</button></details>}
          <div className="row small"><button className="button text" type="button" onClick={() => { update(rejectClaim(project, claim.id, 'insufficient')); setNotice('이 주장은 근거 부족으로 보류합니다.'); }}>근거가 부족해요</button>
            <button className="button text" type="button" onClick={() => { update(rejectClaim(project, claim.id, 'contradicted')); setNotice('상충하는 주장으로 기록했습니다. 작성에 사용하지 않습니다.'); }}>원문과 맞지 않아요</button></div>
        </article>;
      })}
    </details>
    <details className={styles.fold}><summary>고객 질문과 경쟁 비교 <span>질문 {project.questions.length}개 · 비교 {project.comparisons.length}개</span></summary>
      <h3>고객이 궁금해하는 것</h3>{project.questions.length ? <ul className="list">{project.questions.map(q => <li key={q.id}>{q.text} <span className={q.observationLinkStatus === 'missing' ? 'badge warn' : 'badge'}>{questionEvidenceLabel(project, q)}</span></li>)}</ul> : <p className="small muted">아직 조사한 질문이 없습니다.</p>}
      <h3>경쟁 제품과 같은 점·다른 점</h3>{project.comparisons.length ? project.comparisons.map(c => <ComparisonReview key={c.id} project={project} comparison={c} update={update} onError={setError} />) : <p className="small muted">비교할 자료가 없습니다. 자사 특징만으로 우위를 판단하지 않습니다.</p>}
    </details>
    <QuestionDiscoveryPanel key={project.id} project={project} update={update} />
    {<details className={styles.fold}><summary>소비자·검색 자료 더하기 <span>구조화 파일 {project.consumerDatasets.length}개</span></summary><ConsumerDataForm project={project} update={update} /></details>}
    {<details className={styles.fold}><summary>제품 원문 자료 더하기 <span>저장한 자료 {project.sources.length}개 · TXT, MD, PDF</span></summary><SourceForm key={project.id} project={project} update={update} setError={setError} setNotice={setNotice} /></details>}
    {hasAnalysis && <details className={styles.fold} open={!!project.manualResearchRequestId}><summary>조사 보완하기 <span>새 자료나 질문이 있을 때</span></summary><ManualExchange project={project} stage="research" update={update} onError={setError} onNotice={setNotice} /></details>}
    {hasAnalysis && <section className="card" aria-labelledby="next-step-heading"><span className="eyebrow">다음 단계 · 3. 결과 받기</span><h2 id="next-step-heading">작성 요청문을 만드시겠어요?</h2>
      <p className="small muted">{usableEvidence ? `확인된 사실을 담아 작성합니다. 추가로 확인할 제품 사실 후보 ${draftCandidates}개는 검토용으로 구분합니다.` :
        draftCandidates ? `외부 조사에서 가져온 사실 후보 ${draftCandidates}개를 모델·조건과 함께 검토용 원고에 전달합니다. 원문을 대조하기 전까지 최종본으로 사용할 수 없습니다.` :
          '사용할 사실 후보가 없어 자료 보완용 구성안으로 진행할 수 있습니다.'} 다음 화면에서 요청문을 복사해 외부 AI에 보내 주세요.</p>
      <div className="row"><button className="button" type="button" disabled={advancing || (!usableEvidence && !draftCandidates)} onClick={() => void continueToWriting(false)}>
        이 방향으로 작성 요청문 만들기</button>
        <button className="button secondary" type="button" disabled={advancing} onClick={() => void continueToWriting(true)}>자료 보완용 구성안 요청문 만들기</button></div>
      {insightError && <p className="alert" role="alert">{insightError}</p>}
      {advancing && <p role="status" className="small muted">작성 요청문을 저장하고 있습니다…</p>}
      {insightCurrent(project) && <p className="small"><Link href="/results">이미 만든 작성 요청문 보기 →</Link></p>}
    </section>}
    {!hasAnalysis && <div className={styles.next}><p>자료가 부족하면 기능·수치 없는 구성안부터 만들 수 있습니다.</p>
      <button type="button" className="button secondary" disabled={advancing} onClick={() => void continueToWriting(true)}>자료 보완용 구성안 요청문 만들기</button>
      {insightError && <p className="alert" role="alert">{insightError}</p>}
      {insightCurrent(project) && <Link href="/results" className="button secondary">작성 요청문으로 가기</Link>}</div>}
  </>;
}
