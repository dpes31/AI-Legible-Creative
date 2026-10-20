'use client';

import Link from 'next/link';
import { useState } from 'react';
import { channelNames, type Channel } from '@/domain/schema';
import { editDocument, importContent, prepareContent, reviewDocument } from '@/domain/workflow';
import { downloadBlob, downloadableText, downloadZip, serializeDocument, serializeWithSources } from '@/lib/export';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';

export default function ResultsPage() {
  const { project, loading, update } = useWorkspace();
  const [channel, setChannel] = useState<Channel>('ad_copy');
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});

  if (loading) return <p role="status">문구를 불러오는 중입니다…</p>;
  if (!project) return <div className="card"><h1>먼저 알릴 대상을 정해 주세요.</h1><Link className="button" href="/">정보 입력하기</Link></div>;

  const current: Channel = project.selectedChannels.includes(channel) ? channel : project.selectedChannels[0];
  const document = project.documents[current];
  const visibleDocument = document && { ...document, blocks: document.blocks.map(block =>
    edits[block.id] === undefined ? block : { ...block, text: edits[block.id] }),
    status: Object.keys(edits).some(id => document.blocks.some(block => block.id === id)) ? 'stale' as const : document.status };
  const currentProject = visibleDocument ? { ...project, documents: { ...project.documents, [current]: visibleDocument } } : project;
  const createPrompt = () => {
    const prepared = prepareContent(project); update(prepared.project); setPrompt(prepared.prompt); setError('');
  };
  const pasteContent = () => {
    try {
      const incoming = importContent(project, response);
      if (Object.keys(project.documents).some(key => incoming.documents[key as Channel] !== project.documents[key as Channel])) {
        if (Object.keys(project.documents).length && !window.confirm('기존 채널 문구가 있습니다. 현재 내용을 덮어쓰지 않고 새 버전으로 가져오시겠어요?')) return;
      }
      update(incoming); setResponse(''); setError(''); setNotice('채널별 문구를 가져왔습니다. 근거와 표현을 확인해 주세요.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '작성 결과를 읽지 못했어요.'); }
  };
  const copy = async (withSources: boolean) => {
    if (!visibleDocument || !serializeDocument(visibleDocument)) { setError('복사할 본문이 아직 없습니다.'); return; }
    const body = downloadableText(project, visibleDocument, withSources);
    try { await navigator.clipboard.writeText(body); setError(''); setNotice(withSources ? '본문과 공개 가능한 출처를 복사했습니다.' : '이 채널의 본문을 복사했습니다.'); }
    catch { setError('클립보드에 복사하지 못했어요. 아래 본문을 직접 선택해 복사해 주세요.'); }
  };
  const edit = (blockId: string) => {
    if (!document || edits[blockId] === undefined) return;
    const blocks = document.blocks.map(b => b.id === blockId ? { ...b, text: edits[blockId] } : b);
    update(editDocument(project, current, blocks));
    setEdits(old => { const result = { ...old }; delete result[blockId]; return result; });
    setNotice('수정 내용을 저장했습니다. 이 채널의 근거와 표현을 다시 확인해 주세요.');
  };
  const approve = () => {
    if (Object.keys(edits).some(id => document?.blocks.some(block => block.id === id))) { setError('수정 중인 문구를 저장한 뒤 다시 확인해 주세요.'); return; }
    try { update(reviewDocument(project, current)); setError(''); setNotice('현재 버전의 원문과 문구를 대조한 기록을 남겼습니다.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '아직 최종본으로 표시할 수 없습니다.'); }
  };
  return <>
    <section className="hero"><div className="eyebrow">3. 결과 받기</div><h1>채널에 맞는 문구를 각각 만듭니다.</h1>
      <p className="muted">하나의 본문을 여섯 탭에 복제하지 않습니다. 근거가 부족한 문구는 검토용 초안으로 표시합니다.</p></section>
    {error && <p className="alert" role="alert">{error}</p>}
    {notice && <p className="small muted" role="status">{notice}</p>}
    <div className="grid">
      <section className="card"><h2>작성 요청문 만들기</h2>
        {!project.claims.some(c => c.status === 'supported') && <p className="alert small">확인된 제품 사실이 없습니다. 원문을 확인하거나 ‘자료 보완용 구성안’으로 시작할 수 있습니다.</p>}
        {project.mode === 'automatic' && <p className="alert small">유료 API 연결 전입니다. 외부 AI로 직접 작성할 수 있습니다.</p>}
        <button type="button" className="button secondary" onClick={createPrompt}>채널별 작성 요청문 만들기</button>
        {prompt && <div className="field"><label htmlFor="content-prompt">외부 AI에 보낼 요청문</label>
          <textarea id="content-prompt" readOnly value={prompt} style={{ minHeight: 190 }} />
          <button type="button" className="button text" onClick={() => void navigator.clipboard.writeText(prompt).then(() => setNotice('작성 요청문을 복사했습니다.')).catch(() => setError('복사가 되지 않았어요. 요청문을 선택해 복사해 주세요.'))}>요청문 복사</button></div>}
        {project.manualContentRequestId && <div className="field"><label htmlFor="content-response">AI에서 받은 작성 결과 붙여넣기</label>
          <textarea id="content-response" value={response} onChange={e => setResponse(e.target.value)} style={{ minHeight: 140 }} placeholder="요청 ID와 채널이 구분된 응답을 붙여넣어 주세요." />
          <button type="button" className="button" onClick={pasteContent} disabled={!response.trim()}>채널별 문구 가져오기</button></div>}
      </section>
      <aside className="card soft"><h2>문구의 사용 상태</h2>
        <p>검토용 초안은 복사할 수 있지만 확인 상태가 함께 표시됩니다. 외부 AI가 적은 링크만으로 사실이 확인되지는 않습니다.</p>
        <p className="small muted">여섯 채널 중 일부가 실패해도 작성한 채널은 남아 있습니다. 다른 AI 응답을 가져올 때는 기존 편집본을 먼저 백업해 주세요.</p>
        <Link className="button secondary" href="/review">근거 다시 확인하기</Link>
      </aside>
    </div>
    <div className="channel-picker" role="group" aria-label="결과물 종류">
      {project.selectedChannels.map(c => <button key={c} type="button" className={c === current ? 'button' : 'button secondary'} onClick={() => setChannel(c)} aria-pressed={c === current}>{channelNames[c]}{project.documents[c] ? ' ●' : ''}</button>)}
    </div>
    <div className="grid"><section className="card">
      <h2>{channelNames[current]} {document && <span className={document.status === 'blocked' ? 'badge error' : document.status === 'ready' ? 'badge' : 'badge warn'}>
        {document.status === 'ready' ? '현재 버전 확인' : document.status === 'blocked' ? '근거 보완 필요' : document.status === 'outline' ? '자료 보완용 구성안' : document.status === 'stale' ? '수정 후 다시 확인' : '검토용 초안'}
      </span>}</h2>
      {!document && <p className="muted">아직 이 채널의 문구가 없습니다. 작성 요청문으로 선택한 채널을 받아 주세요.</p>}
      {document?.warnings.map(warning => <p key={warning} className="small muted">확인: {warning}</p>)}
      {document?.blocks.map(block => <div className="document-block" key={block.id}>
        <div className="field"><label htmlFor={`block-${block.id}`}>{block.kind === 'note' ? '작성 메모 (복사 본문에서 제외)' : block.kind === 'heading' ? '제목' : block.kind === 'cta' ? '행동 안내' : '본문'}</label>
          <textarea id={`block-${block.id}`} value={edits[block.id] ?? block.text} onChange={e => setEdits(old => ({ ...old, [block.id]: e.target.value }))} onBlur={() => edit(block.id)} />
        </div>
        {!!block.claimRefs.length && <div className="small muted">연결된 근거: {block.claimRefs.map(id => project.claims.find(claim => claim.id === id)?.statement || '근거를 찾지 못함').join(' · ')}</div>}
      </div>)}
      {document && <div className="row"><button type="button" className="button secondary" onClick={approve}>현재 문구와 근거 확인하기</button>
        <p className="small muted">바꾸면 이 채널의 이전 확인 상태가 취소됩니다.</p></div>}
    </section>
    <aside className="card"><h2>본문과 근거</h2>
      {visibleDocument ? <><details open><summary>복사할 본문 보기</summary><pre className="output">{downloadableText(project, visibleDocument)}</pre></details>
        <details><summary>출처 포함 본문 보기</summary><pre className="output">{serializeWithSources(project, visibleDocument)}</pre></details>
        {document.blocks.flatMap(b => b.claimRefs).filter((id, index, all) => all.indexOf(id) === index).map(id => {
          const claim = project.claims.find(c => c.id === id);
          const source = project.sources.find(s => s.id === claim?.sourceId);
          return claim && <div className="document-block small" key={id}><strong>{claim.statement}</strong><br />
            {source ? <>{source.title} · {source.origin === 'fetched' ? '본문 수집' : '사용자 원문 확인'}{source.url && <> · <a href={source.url} rel="noreferrer" target="_blank" className="source-link">원문 링크</a></>}</> : '출처 없음'}
          </div>;
        })}
      </> : <p className="muted">문구를 만들면 사용한 근거와 적용 조건을 여기에서 확인할 수 있습니다.</p>}
    </aside></div>
    {document && <div className="sticky-actions">
      <button type="button" className="button" onClick={() => void copy(false)}>본문 복사</button>
      <button type="button" className="button secondary" onClick={() => void copy(true)}>출처 포함 복사</button>
      <button type="button" className="button secondary" onClick={() => visibleDocument && downloadBlob(`${channelNames[current]}.txt`, new Blob([downloadableText(project, visibleDocument, true)], { type: 'text/plain;charset=utf-8' }))}>이 문서 받기</button>
      <button type="button" className="button secondary" onClick={() => void downloadZip(currentProject).catch(cause => setError(cause instanceof Error ? cause.message : '파일을 만들지 못했어요.'))}>전체 파일 받기</button>
    </div>}
    {document && !serializeDocument(document) && <p className="alert">빈 문서는 복사·다운로드할 수 없습니다.</p>}
  </>;
}
