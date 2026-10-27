'use client';

import { useState } from 'react';
import type { Project } from '@/domain/schema';
import { addConsumerExcerpt, importConsumerExcerptCorpus, linkConsumerObservation, reviewConsumerRowPermissions, type ConsumerExcerptInput } from '@/domain/consumer-evidence';
import { discoveryEvidenceAssessment, discoveryRowCheck, importQuestionDiscovery, markDiscoveryProvided,
  prepareQuestionDiscovery, reviewDiscoveryCandidate } from '@/domain/analysis/question-discovery';
import { discoveryRunReasons } from '@/domain/analysis/discovery-integrity';

const empty: ConsumerExcerptInput = { title: '', url: '', text: '', publishedAt: null, locator: '', interest: '구매·보상·대표성 미확인',
  brand: '', independence: 'unknown', independenceNote: '', privacyReviewed: false, privacyNote: '',
  externalAiAllowed: false, publicationAllowed: false };
const provenance = { observed: '실제 질문', reconstructed: '자료 기반 재구성', hypothesis: '탐색 가설' };

export function QuestionDiscoveryPanel({ project, update }: { project: Project; update: (p: Project) => void }) {
  const [input, setInput] = useState(empty);
  const [rowIds, setRowIds] = useState<string[]>([]);
  const [provider, setProvider] = useState(''), [model, setModel] = useState(''), [version, setVersion] = useState('');
  const [order, setOrder] = useState<'forward' | 'reverse' | 'hash_order'>('forward');
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({}), [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [linkRow, setLinkRow] = useState(''), [linkSource, setLinkSource] = useState('');
  const act = (fn: () => Project, success: string) => {
    try { update(fn()); setError(''); setNotice(success); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '질문 발견 작업을 저장하지 못했습니다.'); setNotice(''); return false; }
  };
  const set = <K extends keyof ConsumerExcerptInput>(key: K, value: ConsumerExcerptInput[K]) => setInput(old => ({ ...old, [key]: value }));
  const rows = project.consumerObservations;
  return <section className="card" aria-labelledby="discovery-heading">
    <h2 id="discovery-heading">소비자 원문에서 질문 발견</h2>
    <p className="small muted">제품 설명·사전 질문을 보내지 않습니다. 후보의 도출 경로·한계를 검토하며, 시장 대표 니즈·제품 적합성은 확정하지 않습니다. 유료 API를 호출하지 않습니다.</p>
    {error && <p role="alert" className="alert">{error}</p>}{notice && <p role="status" className="small">{notice}</p>}
    <details><summary>공개 소비자 발췌와 출처 연결</summary>
      <p className="small">본문을 확인한 최소 구간만 입력하고 사용자명·연락처·건강 상세는 제외해 주세요. 구매/발행자 진위가 인증됐다는 뜻은 아닙니다.</p>
      <label className="field">소비자 발췌 묶음 JSON 가져오기<input type="file" accept=".json,application/json" onChange={e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 500000) { setError('발췌 묶음이 50만 바이트를 넘습니다.'); return; }
        void file.text().then(raw => act(() => importConsumerExcerptCorpus(project, raw), '실제 발췌 묶음을 보관했습니다. 외부 제공·공개 사용·비식별 확인은 미승인 상태입니다.')).catch(() => setError('발췌 파일을 읽지 못했습니다.'));
      }} /></label>
      <label className="field">발췌 자료명<input value={input.title} onChange={e => set('title', e.target.value)} /></label>
      <label className="field">소비자 원문 URL<input type="url" value={input.url} onChange={e => set('url', e.target.value)} /></label>
      <label className="field">소비자 원문 발췌<textarea value={input.text} onChange={e => set('text', e.target.value)} /></label>
      <label className="field">확보 구간·생략 범위<input value={input.locator} onChange={e => set('locator', e.target.value)} /></label>
      <label className="field">발췌 게시일<input type="date" value={input.publishedAt || ''} onChange={e => set('publishedAt', e.target.value || null)} /></label>
      <label className="field">자료의 브랜드 (미확인이면 비움)<input value={input.brand} onChange={e => set('brand', e.target.value)} /></label>
      <label className="field">이 발췌의 보상·표본 제한<input value={input.interest} onChange={e => set('interest', e.target.value)} /></label>
      <label className="row small"><input type="checkbox" checked={input.independence === 'declared'} onChange={e => set('independence', e.target.checked ? 'declared' : 'unknown')} />다른 사건·재게시와 독립적인지 대조했습니다 (수집자 선언)</label>
      <label className="field">독립성 대조 내용<input value={input.independenceNote} onChange={e => set('independenceNote', e.target.value)} /></label>
      <label className="row small"><input type="checkbox" checked={input.privacyReviewed} onChange={e => set('privacyReviewed', e.target.checked)} />개인정보와 문맥 생략 범위를 검토했습니다</label>
      <label className="field">비식별·확보 범위 검토 이유<textarea value={input.privacyNote} onChange={e => set('privacyNote', e.target.value)} /></label>
      <label className="row small"><input type="checkbox" checked={input.externalAiAllowed} onChange={e => set('externalAiAllowed', e.target.checked)} />이 발췌를 외부 AI에 제공할 권한을 확인했습니다</label>
      <label className="row small"><input type="checkbox" checked={input.publicationAllowed} onChange={e => set('publicationAllowed', e.target.checked)} />공개 콘텐츠 근거로 사용할 권한을 확인했습니다</label>
      <button type="button" className="button secondary" onClick={() => {
        if (act(() => addConsumerExcerpt(project, input), '소비자 행과 원문 스냅샷을 보관했습니다. 질문은 아직 발견하지 않았습니다.')) setInput(empty);
      }}>발췌·관찰 행 저장</button>
      <details><summary>기존 파일 행에 원문 출처 연결</summary>
        <label className="field">연결할 원본 행<select value={linkRow} onChange={e => setLinkRow(e.target.value)}><option value="">선택</option>
          {rows.map(row => <option key={row.id} value={row.id}>{row.sourceRow}: {(row.text || row.query || '').slice(0,70)}</option>)}</select></label>
        <label className="field">연결할 저장 출처<select value={linkSource} onChange={e => setLinkSource(e.target.value)}><option value="">선택</option>
          {project.sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
        <p className="small">위 비식별·독립성 검토 항목을 이 행에 맞게 작성한 뒤 연결합니다. 출처와 데이터셋의 외부 제공 권한을 각각 검사합니다.</p>
        <button type="button" className="button secondary" onClick={() => act(() => linkConsumerObservation(project, linkRow, linkSource, input), '원문 행을 다시 대조해 연결했습니다.')}>기존 행의 출처·검토 연결</button>
        <button type="button" className="button secondary" onClick={() => act(() => reviewConsumerRowPermissions(project, linkRow, input), '선택한 행의 권한·비식별 검토를 보관했습니다. 다른 행은 자동 허용하지 않습니다.')}>선택 행의 권한·비식별 검토 저장</button>
      </details>
    </details>
    <details><summary>발견할 원자료 선택 ({rows.length}행)</summary>
      <button type="button" className="button text" onClick={() => setRowIds(rows.map(r => r.id))}>모든 행 선택</button>
      <button type="button" className="button text" onClick={() => setRowIds([])}>선택 해제</button>
      {rows.map(row => { const check = discoveryRowCheck(project, row.id); return <div key={row.id}>
        <label className="row small"><input type="checkbox" checked={rowIds.includes(row.id)} onChange={e => setRowIds(old => e.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))} />행 {row.sourceRow}: {row.text || row.query || '본문 없음'}</label>
        <p className="small muted">{check.reasons.join(' ') || '전달 조건 대조 통과 · 발행자/구매 진위는 미확인'}</p>
      </div>; })}
    </details>
    <label className="field">실행할 외부 서비스<input value={provider} onChange={e => setProvider(e.target.value)} placeholder="미확인이면 비움" /></label>
    <label className="field">화면에 표시된 모델명<input value={model} onChange={e => setModel(e.target.value)} placeholder="추측하지 마세요" /></label>
    <label className="field">표시된 모델 버전<input value={version} onChange={e => setVersion(e.target.value)} placeholder="미공개이면 비움" /></label>
    <label className="field">입력 순서<select value={order} onChange={e => setOrder(e.target.value as typeof order)}><option value="forward">선택 순서</option><option value="reverse">역순</option><option value="hash_order">기록된 해시 정렬 순서</option></select></label>
    <button type="button" className="button secondary" onClick={() => act(() => prepareQuestionDiscovery(project,
      { rowIds, provider, model, modelVersion: version, order }), '새 실행을 보관했습니다. 제외 사유와 요청문을 확인해 주세요.')}>질문 발견 실행 만들기</button>
    <p className="small muted">실행은 최신순, 후보는 응답 순서로 표시하며 우선순위가 아닙니다. 후보 수용은 분석 검토용이며 기존 작성 요청문에 자동 전달하지 않습니다.</p>
    {[...project.questionDiscoveryRuns].reverse().map(run => {
      const stale = discoveryRunReasons(project, run);
      return <details key={run.id}><summary>발견 실행 {run.createdAt} · {run.status}</summary>
        <p className="small">{run.provider} / {run.model} / 버전 {run.modelVersion} · 모델 확인: {run.modelProvenance}</p>
        {run.parentRunId && <p className="small source-link">이전 실행: {run.parentRunId}</p>}
        <button type="button" className="button text" onClick={() => act(() => prepareQuestionDiscovery(project, {
          rowIds: run.selectedRowIds, provider: run.provider, model: run.model, modelVersion: run.modelVersion,
          order: 'reverse', parentRunId: run.id }), '원래 실행과 응답을 보존하고 같은 선택 행의 역순 실행을 추가했습니다.')}>같은 선택 행으로 역순 새 실행</button>
        <p className="small source-link">실행 {run.id} · 입력 {run.inputHash} · 요청문 {run.promptHash}</p>
        {stale.map(reason => <p key={reason} className="small">보류: {reason}</p>)}
        {run.excluded.map(row => <p key={row.rowId} className="small">제외 행 {row.rowId}: {row.reasons.join(' ')}</p>)}
        <label className="field">소비자 발견 요청문<textarea readOnly value={run.prompt} /></label>
        <button type="button" className="button text" disabled={!run.prompt || !!stale.length} onClick={() => void navigator.clipboard.writeText(run.prompt).then(() => {
          setNotice('요청문을 복사했습니다. 외부 서비스에 제공한 경우 아래에 별도로 기록해 주세요.'); setError('');
        }).catch(() => setError('복사가 허용되지 않았습니다. 요청문을 직접 선택해 복사해 주세요.'))}>발견 요청문 복사</button>
        <button type="button" className="button text" disabled={!run.prompt || !!stale.length} onClick={() => act(() => markDiscoveryProvided(project, run.id), '사용자가 외부 제공을 기록했습니다. 서비스의 전송·실행 완료 인증은 아닙니다.')}>요청문 외부 제공 기록</button>
        <label className="field">질문 발견 원본 응답<textarea value={run.responseDraft} onChange={e => {
          if (e.target.value.length > 500000) { setError('응답이 50만 자를 넘어 저장하지 않았습니다. 원본을 파일로 보관해 주세요. 일부만 잘라 저장하지 않습니다.'); return; }
          update({ ...project, questionDiscoveryRuns: project.questionDiscoveryRuns.map(r => r.id === run.id ? { ...r, responseDraft: e.target.value } : r) });
        }} /></label>
        <button type="button" className="button secondary" onClick={() => act(() => importQuestionDiscovery(project, run.id, run.responseDraft), '응답 원본과 대조 결과를 보관했습니다. 실패 사유도 실행 이력에 남습니다.')}>발견 응답 원본 보관·대조</button>
        {run.attempts.map(attempt => <details key={attempt.id}><summary>응답 시도 {attempt.at} · {attempt.status}</summary>
          <p className="small">{attempt.responseHash}</p>{attempt.errors.map(reason => <p className="small" key={reason}>{reason}</p>)}
          <pre className="output">{attempt.raw || '(빈 응답)'}</pre>
          {attempt.rowDispositions.map(row => <p key={row.rowId} className="small">{row.rowId}: {row.status} · {row.reason}</p>)}
        </details>)}
        <details><summary>선택·제외·입력·실행 상태 원본</summary><pre className="output">{JSON.stringify({ manifest: run.manifest, excluded: run.excluded, input: run.input, events: run.events }, null, 2)}</pre></details>
        {project.questionCandidates.filter(c => c.runId === run.id).map(candidate => {
          const assessment = discoveryEvidenceAssessment(project, candidate);
          return <article key={candidate.id} className="card"><h3>{candidate.text}</h3>
            <p className="small">{provenance[candidate.provenance]} · {candidate.status} · {assessment.priority}</p>
            <p className="small">원문 사건 그룹 {assessment.incidentCount} / 전체 {assessment.sampleIncidentCount} · 독립성 대조 선언 {assessment.independentlyDeclaredCount}</p>
            <p>{candidate.reason}</p><p className="small">다른 해석: {candidate.alternativeInterpretations.join(' / ')}</p>
            <p className="small">미충족 여부의 AI 제안: {candidate.unmetNeed} · {assessment.limitation}</p>
            <p className="small">의사결정 영향의 AI 제안: {candidate.decisionImpact} · {candidate.impactReason}</p>
            <details><summary>상황·과업·장애·기대 결과의 근거</summary><pre className="output">{JSON.stringify(candidate.context, null, 2)}</pre></details>
            {candidate.evidence.map((e, i) => <blockquote key={i}>{e.quote}<p className="small">행 {e.rowId} · [{e.start},{e.end}) · {e.role}</p>
              {run.manifest.find(r => r.rowId === e.rowId) && <a className="source-link small" href={run.manifest.find(r => r.rowId === e.rowId)!.sourceUrl} target="_blank" rel="noreferrer">실행 당시 원문 링크 열기</a>}
            </blockquote>)}
            {candidate.holdReasons.map(reason => <p key={reason} className="small">보류: {reason}</p>)}
            {candidate.review && <p className="small">사용자 검토 (human-only): {candidate.review.note}</p>}
            <label className="row small"><input type="checkbox" checked={confirmed[candidate.id] || false} onChange={e => setConfirmed(old => ({ ...old, [candidate.id]: e.target.checked }))} />원문·질문 유형·대안 해석·표본 한계를 직접 검토했습니다</label>
            <label className="field">질문 후보 검토 이유<textarea value={notes[candidate.id] || ''} onChange={e => setNotes(old => ({ ...old, [candidate.id]: e.target.value }))} /></label>
            <button type="button" className="button secondary" disabled={!confirmed[candidate.id]} onClick={() => act(() => reviewDiscoveryCandidate(project, candidate.id, 'accepted', notes[candidate.id] || ''), '분석 후보를 수용했습니다. 대표 니즈·미충족 수요의 확정은 아닙니다.')}>분석 후보 수용</button>
            <button type="button" className="button text" onClick={() => act(() => reviewDiscoveryCandidate(project, candidate.id, 'rejected', notes[candidate.id] || ''), '제외 사유와 원본을 보관했습니다.')}>후보 제외 기록</button>
          </article>;
        })}
      </details>;
    })}
  </section>;
}
