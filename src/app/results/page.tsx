'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { channelNames, type Channel, type ChannelDocument } from '@/domain/schema';
import { applyDocumentProposal, checkCurrentDocument, editDocument, restoreDocumentVersion, reviewDocument, updateDocumentText } from '@/domain/workflow';
import { downloadBlob, downloadableMarkdown, downloadableText, downloadWord, downloadZip, serializeDocument } from '@/lib/export';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { ManualExchange } from '@/features/manual/ManualExchange';
import { insightCurrent } from '@/domain/insight';
import styles from '@/features/results/Results.module.css';

const statusNames: Record<ChannelDocument['status'], string> = { ready: '현재 버전 확인', blocked: '근거 보완 필요', outline: '자료 보완용 구성안', stale: '수정 후 다시 확인', needs_review: '검토용 초안' };
const blockNames = { heading: '제목', paragraph: '본문', bullet: '항목', cta: '행동 안내', note: '작성 메모 (복사 본문에서 제외)' };

export default function ResultsPage() {
  return <Suspense fallback={<p role="status">문구를 불러오는 중입니다…</p>}><ResultsWorkspace /></Suspense>;
}
function ResultsWorkspace() {
  const { project, loading, update } = useWorkspace();
  const router = useRouter(); const searchParams = useSearchParams();
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [activeBlock, setActiveBlock] = useState(''); const [copyFallback, setCopyFallback] = useState('');
  const [reviewedRevision, setReviewedRevision] = useState(''); const [feedbackRevision, setFeedbackRevision] = useState('');
  if (loading) return <p role="status">문구를 불러오는 중입니다…</p>;
  if (!project) return <div className="card"><h1>먼저 알릴 대상을 정해 주세요.</h1><Link className="button" href="/">정보 입력하기</Link></div>;
  const current: Channel = project.selectedChannels.find(item => item === searchParams.get('channel')) || project.selectedChannels[0];
  const document = project.documents[current]; const proposal = project.documentProposals[current];
  const reviewKey = document ? `${document.id}:${document.revision}:${project.evidenceRevision}:${project.insight.revision}` : '';
  const assignedAnswers = project.answerPlans.filter(plan => plan.channels.some(direction => direction.channel === current));
  const hasDocuments = Object.keys(project.documents).length > 0;
  const selected = document?.blocks.find(b => b.id === activeBlock) || document?.blocks.find(b => b.kind !== 'note');
  const refs = selected?.claimRefs || [];
  const issues = document?.validation?.issues.filter(issue => issue.blockId === selected?.id || issue.blockId === 'document') || [];
  const act = (operation: () => void, success?: string) => {
    try { operation(); setError(''); if (success) setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '내용을 확인한 뒤 다시 시도해 주세요.'); }
  };
  const selectChannel = (channel: Channel) => { router.replace(`/results?channel=${channel}`, { scroll: false }); setActiveBlock(''); setError(''); setNotice(''); setCopyFallback(''); };
  const copy = async (withSources: boolean) => {
    if (!document || !serializeDocument(document)) { setError('복사할 본문이 아직 없습니다.'); return; }
    const body = downloadableText(project, document, withSources);
    try { await navigator.clipboard.writeText(body); setError(''); setCopyFallback(''); setNotice(withSources ? '본문과 공개 가능한 출처를 복사했습니다.' : '이 채널의 본문을 복사했습니다.'); }
    catch { setCopyFallback(body); setError('클립보드에 복사하지 못했어요. 아래 본문을 직접 선택해 복사해 주세요.'); }
  };
  return <>
    <div className={styles.heading}><div><div className="eyebrow">3. 결과 받기</div><h1>필요한 문구부터 골라 쓰세요.</h1><p>{project.name} · 선택한 채널 {project.selectedChannels.length}개</p></div><div><Link href="/review" className="quiet-link small">인사이트 다시 보기 ↗</Link><br /><Link href="/assets" className="quiet-link small">질문·게시 콘텐츠 쌓기 ↗</Link></div></div>
    {error && <p className="alert" role="alert">{error}</p>}
    {notice && <p className="small muted" role="status">{notice}</p>}
    {project.migrationNote && <details className="notice-details"><summary>가져온 응답에서 확인할 사항</summary><p className="small muted">{project.migrationNote}</p></details>}
    {!hasDocuments && <section className="card"><span className="eyebrow">두 번째 요청 · 작성</span><h2>확인한 근거로 채널별 문구를 만듭니다.</h2>
      {!project.claims.some(c => c.status === 'supported') && <p className="small muted">확인된 사실이 아직 없습니다. 외부 조사에서 가져온 제품 사실 후보는 검토용 원고에 구분해 담을 수 있으며, 원문·의미를 확인하기 전에는 최종본이 아닙니다.</p>}
      {insightCurrent(project) ? <ManualExchange project={project} stage="content" update={update} onError={setError} onNotice={setNotice} />
        : <p>핵심 인사이트에서 질문과 작성 방향을 먼저 확인해 주세요. <Link href="/review">인사이트 검수하기</Link></p>}
    </section>}
    <div className={styles.channels} role="group" aria-label="결과물 종류">{project.selectedChannels.map(c => <button key={c} type="button" onClick={() => selectChannel(c)} aria-pressed={c === current}>{channelNames[c]}<span>{project.documents[c] ? '작성됨' : '미작성'}</span></button>)}</div>
    <div className={`${styles.mobileChannel} field`}><label htmlFor="result-channel">보고 싶은 결과물</label><select id="result-channel" value={current} onChange={e => selectChannel(e.target.value as Channel)}>{project.selectedChannels.map(c => <option value={c} key={c}>{channelNames[c]} · {project.documents[c] ? '작성됨' : '미작성'}</option>)}</select></div>
    {proposal && <section className={styles.proposal}><h2>다시 쓴 문구가 도착했습니다.</h2><p className="small">기존 수정본은 그대로 있습니다. 내용을 비교한 뒤 새 문구를 적용하세요.</p>
      <details><summary>기존 문구와 새 제안 비교하기</summary><div className="grid"><div><h3>기존 문구</h3><pre className="output">{document ? serializeDocument(document) : '없음'}</pre></div><div><h3>새 제안</h3><pre className="output">{serializeDocument(proposal)}</pre></div></div></details>
      {proposal.baseRevision !== document?.revision && <p className="small">요청한 뒤 기존 문구를 수정했습니다. 수정한 부분이 새 제안에도 반영됐는지 확인해 주세요.</p>}
      <div className="row"><button className="button" type="button" onClick={() => act(() => {
        const changed = proposal.baseRevision !== document?.revision;
        if (changed && !window.confirm('수정한 기존 문구는 이전 버전에 보관합니다. 새 제안을 적용할까요?')) return;
        update(applyDocumentProposal(project, current, changed));
      }, '새 제안을 적용하고 기존 문구는 이전 버전에 보관했습니다.')}>새 문구 적용하기</button>
      <button className="button secondary" type="button" onClick={() => { const next = { ...project.documentProposals }; delete next[current]; update({ ...project, documentProposals: next }); setNotice('기존 문구를 유지합니다.'); }}>기존 문구 유지하기</button></div>
    </section>}
    {document && <div className={styles.toolbar}>
      <button className="button" type="button" onClick={() => void copy(false)}>{document.status === 'ready' ? '최종본 복사' : '검토용 초안 복사'}</button>
      <button className="button secondary" type="button" onClick={() => void copy(true)}>출처 포함 복사</button>
      <details className={styles.download}><summary>파일 받기</summary><div>
        <button className="button text" type="button" onClick={() => act(() => { if (!serializeDocument(document)) throw new Error('받을 본문이 없습니다.'); downloadBlob(`${channelNames[current]}.txt`, new Blob([downloadableText(project, document, true)], { type: 'text/plain;charset=utf-8' })); })}>이 문서 받기</button>
        <button className="button text" type="button" onClick={() => act(() => { if (!serializeDocument(document)) throw new Error('받을 본문이 없습니다.'); downloadBlob(`${channelNames[current]}.md`, new Blob([downloadableMarkdown(project, document)], { type: 'text/markdown;charset=utf-8' })); })}>마크다운 받기</button>
        <button className="button text" type="button" onClick={() => void downloadWord(project).catch(cause => setError(cause instanceof Error ? cause.message : 'Word 파일을 만들지 못했어요.'))}>통합 Word 받기</button>
        <button className="button text" type="button" onClick={() => void downloadZip(project).catch(cause => setError(cause instanceof Error ? cause.message : '파일을 만들지 못했어요.'))}>전체 파일 받기</button>
      </div></details>
    </div>}
    {copyFallback && <div className="field"><label htmlFor="copy-fallback">직접 복사할 본문</label><textarea id="copy-fallback" readOnly value={copyFallback} onFocus={e => e.target.select()} /></div>}
    <div className={styles.workspace}><section className={styles.editor} aria-label="문구 편집">
      <div className={styles.editorTitle}><h2>{channelNames[current]}</h2>{document && <span data-testid="publication-status" className={document.status === 'blocked' ? 'badge error' : document.status === 'ready' ? 'badge' : 'badge warn'}>{statusNames[document.status]}</span>}</div>
      {!document && <p className="muted">아직 이 채널의 문구가 없습니다. 응답에 없던 채널은 다른 내용으로 채우지 않습니다.</p>}
      {document?.blocks.map(block => <div key={block.id} className={styles.block} data-kind={block.kind} onFocus={() => setActiveBlock(block.id)}>
        <div className={styles.blockLabel}><label htmlFor={`block-${block.id}`}>{blockNames[block.kind]}</label><button type="button" className="button text" aria-label={`${blockNames[block.kind]} 문단 삭제`} onClick={() => act(() => update(editDocument(project, current, document.blocks.filter(b => b.id !== block.id))))}>삭제</button></div>
        <textarea id={`block-${block.id}`} value={block.text} maxLength={25000} onChange={e => act(() => update(updateDocumentText(project, current, block.id, e.target.value)))} />
        {block.kind !== 'note' && <>
          <small>{block.claimRefs.length ? `연결된 근거 ${block.claimRefs.length}개 · 의미와 조건을 원문과 대조해 주세요.` : '객관적 사실을 말하는 문장이라면 아래에서 근거를 연결해 주세요.'}</small>
          <details><summary className="small">근거 연결·적용 조건</summary>{project.claims.length ? project.claims.map(claim => <label className="row small" key={claim.id}><input type="checkbox" checked={block.claimRefs.includes(claim.id)} onChange={e => act(() => update(editDocument(project, current, document.blocks.map(b => b.id === block.id ? { ...b, claimRefs: e.target.checked ? [...b.claimRefs, claim.id] : b.claimRefs.filter(id => id !== claim.id) } : b))))} /><span>{claim.statement} · {claim.status === 'supported' ? '원문 대조함' : '미확인'}{claim.conditions ? ` / 조건: ${claim.conditions}` : ''}</span></label>) : <p className="small muted">연결할 주장이 없습니다. 분석 화면에서 원문을 먼저 확인해 주세요.</p>}</details>
        </>}
      </div>)}
      {document && <>
        <div className="row"><button className="button text" type="button" onClick={() => act(() => update(editDocument(project, current, [...document.blocks, { id: crypto.randomUUID(), kind: 'paragraph', text: '', claimRefs: [] }]))) }>+ 문단 더하기</button>
          <button className="button text" type="button" onClick={() => act(() => update(editDocument(project, current, [...document.blocks, { id: crypto.randomUUID(), kind: 'note', text: '', claimRefs: [] }]))) }>+ 작성 메모</button></div>
        <div className={styles.review}>
          {!!assignedAnswers.length && <details><summary>이 문서가 답할 고객 질문 {assignedAnswers.length}개</summary><ul>{assignedAnswers.map(plan => {
            const question = project.questions.find(item => item.id === plan.questionId);
            const covered = document.blocks.some(block => block.kind !== 'note' && block.questionRefs?.includes(plan.questionId));
            return <li key={plan.id}><strong>{question?.text || '고객 질문'}</strong> · {covered ? '본문 연결 있음' : '본문 연결 없음'}<br />
              답변 방향: {plan.directAnswer || '조사에서 직접 답을 얻지 못함'}{plan.applicableModel && <> · 적용 모델: {plan.applicableModel}</>}
              {plan.limitations && <> · 한계: {plan.limitations}</>}</li>;
          })}</ul></details>}
          <label className="row small"><input type="checkbox" checked={reviewedRevision === reviewKey} onChange={event => setReviewedRevision(event.target.checked ? reviewKey : '')} />이 원고가 고객 질문에 답하고 모델·조건이 원문과 맞는지 확인했습니다.</label>
          {project.insight.feedback.trim() && <><p className="small">인사이트 수정 의견: {project.insight.feedback}</p><label className="row small"><input type="checkbox" checked={feedbackRevision === reviewKey} onChange={event => setFeedbackRevision(event.target.checked ? reviewKey : '')} />위 수정 의견이 이 원고에 반영됐는지 확인했습니다.</label></>}
          <button className="button secondary" type="button" onClick={() => act(() => update(reviewDocument(project, current, {
            meaningReviewed: reviewedRevision === reviewKey, feedbackReviewed: feedbackRevision === reviewKey,
          })), '이 채널의 현재 본문을 검토한 기록을 남겼습니다.')}>이 채널 원고 검토 완료</button>
          <span className="small muted">자동 검사에서 사실·질문·모델 조건이 빠지면 최종본으로 바뀌지 않습니다. 의미는 직접 대조해야 합니다.</span>
        </div>
        {!!project.documentHistory[current]?.length && <details><summary>이전 버전 {project.documentHistory[current]?.length}개 보기</summary>{project.documentHistory[current]?.slice(-10).reverse().map(old => <div className="document-block" key={`${old.id}-${old.revision}`}><strong className="small">버전 {old.revision}</strong><pre className="output">{serializeDocument(old)}</pre><button className="button secondary" type="button" onClick={() => act(() => update(restoreDocumentVersion(project, current, old.id, old.revision)), '이전 본문을 가져왔습니다. 현재 근거로 다시 확인해 주세요.')}>이 본문 다시 사용하기</button></div>)}</details>}
      </>}
      {project.previousDraft && <details><summary>예전 앱에서 가져온 초안 보기</summary><pre className="output">{project.previousDraft}</pre></details>}
    </section>
    <aside className={styles.evidence} aria-label="선택한 문구의 근거">
      <section><h2>이 문구의 근거</h2><p className="muted">문단을 선택하면 연결한 원문과 확인할 사항을 보여드립니다.</p>
        {refs.length ? refs.map(id => { const claim = project.claims.find(c => c.id === id); const source = project.sources.find(s => s.id === claim?.sourceId);
          return <div className="document-block" key={id}><h3>{claim?.statement || '연결된 주장이 없습니다.'}</h3><blockquote>{claim?.quote || '원문 구간 없음'}</blockquote><p>{source?.title || '출처 없음'} · {source?.origin === 'fetched' ? '본문 수집' : source?.origin === 'direct_input' ? '사용자 제공 원문' : '원문 확인 필요'}</p>
            {claim?.conditions && <p><strong>본문에 함께 쓸 조건</strong><br />{claim.conditions}</p>}{source?.url && <a className="source-link small" href={source.url} rel="noreferrer" target="_blank">원문 열기 ↗</a>}</div>;
        }) : <p className="small muted">연결된 사실 주장이 없습니다. 감성 문구나 제안인지, 확인할 사실이 빠졌는지 살펴보세요.</p>}
        {!!issues.length && <ul>{issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>}
        {document?.warnings.filter(w => !issues.some(i => i.message === w)).map(w => <p key={w} className="muted">{w}</p>)}
        {document && <button className="button secondary" type="button" onClick={() => act(() => update(checkCurrentDocument(project, current)), '현재 근거로 기본 검사를 했습니다. 문장의 의미는 직접 확인해 주세요.')}>현재 근거로 다시 검사</button>}
        <p className="small muted">자동 의미 검사: 미실행 · 원문 대조: 직접 확인</p>
      </section>
      {document && <details><summary>복사할 본문 미리 보기</summary><pre className="output" data-testid="serialized-document">{downloadableText(project, document, true)}</pre></details>}
    </aside></div>
    {hasDocuments && <details className={styles.exchange} open={!!project.manualContentRequestId}><summary>{document ? '이 채널 다시 작성하기' : '누락된 채널 작성하기'}</summary><ManualExchange project={project} stage="content" channels={[current]} update={update} onError={setError} onNotice={setNotice} /></details>}
  </>;
}
