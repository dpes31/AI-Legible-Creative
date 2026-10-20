'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { attachOriginalText, fingerprint, importResearch, prepareResearch, verifyClaim } from '@/domain/workflow';
import { type Project, type Source } from '@/domain/schema';
import { readEvidenceFile } from '@/features/review/readFile';

function markStale(project: Project) {
  return Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'];
}

export default function ReviewPage() {
  const { project, loading, update } = useWorkspace();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [publicUse, setPublicUse] = useState(false);
  const [externalUse, setExternalUse] = useState(false);
  const [researchPrompt, setResearchPrompt] = useState('');
  const [researchPromptId, setResearchPromptId] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [publication, setPublication] = useState<Record<string, boolean>>({});

  if (loading) return <p role="status">작업을 불러오는 중입니다…</p>;
  if (!project) return <div className="card"><h1>먼저 알릴 대상을 정해 주세요.</h1><Link className="button" href="/">정보 입력하기</Link></div>;

  const addSource = () => {
    if (!title.trim() || !body.trim()) { setError('자료 이름과 실제 본문을 넣어 주세요. 링크만으로 원문 확인이 끝나지 않습니다.'); return; }
    if (body.length > 50000) { setError('원문이 5만 자를 넘습니다. 필요한 구간을 선택해 넣어 주세요.'); return; }
    try {
      if (url.trim()) { const parsed = new URL(url.trim()); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid url'); }
      const source: Source = {
        id: crypto.randomUUID(), projectId: project.id, title: title.trim(), url: url.trim() || null,
        excerpt: body.trim(), body: body.trim(), sourceType: 'user', retrieval: 'user_provided',
        origin: 'direct_input', publishedAt: null, collectedAt: new Date().toISOString(), externalAiAllowed: externalUse,
        publicationAllowed: publicUse, hash: fingerprint(body.trim()),
      };
      update({ ...project, sources: [...project.sources, source], evidenceRevision: project.evidenceRevision + 1,
        manualResearchRequestId: null, manualContentRequestId: null,
        documents: markStale(project) });
      setResearchPrompt(''); setTitle(''); setBody(''); setUrl(''); setExternalUse(false); setPublicUse(false); setError(''); setNotice('자료를 저장했습니다. 이전 조사 요청문은 무효가 되었습니다. 사실과 출처를 확인해 주세요.');
    } catch { setError('링크를 정확한 https:// 또는 http:// 주소로 입력해 주세요.'); }
  };

  const fileChanged = async (file?: File) => {
    if (!file) return;
    if (project.sources.filter(s => s.sourceType === 'user').length >= 5) { setError('직접 올리는 자료는 다섯 개까지 사용할 수 있습니다.'); return; }
    setFileLoading(true); setError('');
    try {
      const text = await readEvidenceFile(file);
      setTitle(file.name); setBody(text.body); setNotice(`${text.page}의 글자를 읽었습니다. 공개 사용 범위를 확인한 뒤 자료를 저장해 주세요.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '파일을 읽지 못했어요.'); }
    finally { setFileLoading(false); }
  };

  const createPrompt = () => {
    try { const prepared = prepareResearch(project); update(prepared.project); setResearchPrompt(prepared.prompt); setResearchPromptId(prepared.project.manualResearchRequestId); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '요청문을 만들지 못했어요.'); }
  };
  const pasteResearch = () => {
    try { update(importResearch(project, response)); setResponse(''); setError(''); setNotice('조사 내용을 가져왔습니다. 출처와 주장을 확인해 주세요.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '조사 내용을 읽지 못했어요.'); }
  };

  const confirmClaim = (id: string) => {
    try { update(verifyClaim(project, id)); setError(''); setNotice('원문 대조 기록을 남겼습니다. 연결된 문구는 다시 확인해야 합니다.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '원문을 확인할 수 없습니다.'); }
  };

  return <>
    <section className="hero"><div className="eyebrow">2. 분석 확인</div><h1>{project.name}을 선택할 이유는 무엇인가요?</h1>
      <p className="muted">광고 목적과 고객 상황에 맞춰 경쟁 제품과 비교할 근거를 확인합니다. 찾지 못한 자료를 ‘없는 기능’으로 단정하지 않습니다.</p></section>
    {project.migrationNote && <p className="alert" role="status">{project.migrationNote}</p>}
    {error && <p className="alert" role="alert">{error}</p>}
    {notice && <p className="small muted" role="status">{notice}</p>}
    <div className="grid">
      <section className="card"><h2>자료 더하기</h2><p className="muted small">원문을 붙여넣거나 글자를 선택할 수 있는 PDF를 올려 주세요. 외부 AI에 전달하는 자료는 따로 확인합니다.</p>
        <div className="field"><label htmlFor="source-title">자료 이름</label><input id="source-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 공식 제품 설명" /></div>
        <div className="field"><label htmlFor="source-url">원문 링크, 있다면</label><input id="source-url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" /></div>
        <div className="field"><label htmlFor="source-file">또는 파일로 가져오기</label><input id="source-file" type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" onChange={e => void fileChanged(e.target.files?.[0])} />
          {fileLoading && <span role="status">자료에서 글자를 읽고 있습니다…</span>}</div>
        <div className="field"><label htmlFor="source-body">실제 원문</label><textarea id="source-body" value={body} onChange={e => setBody(e.target.value)} placeholder="확인할 문장과 적용 조건을 원문 그대로 붙여넣어 주세요." /></div>
        <label className="row small"><input type="checkbox" checked={publicUse} onChange={e => setPublicUse(e.target.checked)} />이 자료를 공개 문구의 근거로 써도 됩니다</label>
        <label className="row small"><input type="checkbox" checked={externalUse} onChange={e => setExternalUse(e.target.checked)} />이 자료를 외부 AI 조사 요청문에 넣어도 됩니다</label>
        <p className="small muted">확인하지 않은 자료는 공개 문구에 사용하지 않습니다.</p>
        <button className="button secondary" onClick={addSource} type="button">자료 저장하기</button>
        {!!project.sources.length && <details><summary>저장한 자료 {project.sources.length}개</summary><ul className="list">
          {project.sources.map(source => <li key={source.id}><strong>{source.title}</strong> · {source.retrieval === 'fetched' ? '본문 확인' : '사용자 제공'}
            {source.url && <> · <a className="source-link" href={source.url} target="_blank" rel="noreferrer">원문 열기</a></>}
            {!source.publicationAllowed && <span className="badge warn">공개 문구 사용 미확인</span>}
          </li>)}
        </ul></details>}
      </section>
      <section className="card"><h2>외부 AI로 조사하기</h2><p>자사 사실·고객 질문·경쟁 제품·부족한 자료를 한 번에 요청합니다.</p>
        {project.mode === 'automatic' && <p className="alert small">자동 연결은 아직 비활성입니다. 아래 수동 요청문으로 작업을 계속할 수 있습니다.</p>}
        <button type="button" className="button secondary" onClick={createPrompt}>조사 요청문 만들기</button>
        {researchPrompt && researchPromptId === project.manualResearchRequestId && <div className="field"><label htmlFor="research-prompt">외부 AI에 보낼 요청문</label><textarea id="research-prompt" value={researchPrompt} readOnly style={{ minHeight: 190 }} />
          <button className="button text" type="button" onClick={() => void navigator.clipboard.writeText(researchPrompt).then(() => setNotice('조사 요청문을 복사했습니다.')).catch(() => setError('복사가 되지 않았어요. 요청문을 길게 눌러 선택해 주세요.'))}>요청문 복사</button></div>}
        {project.manualResearchRequestId && <div className="field"><label htmlFor="research-response">AI에서 받은 조사 결과 붙여넣기</label>
          <textarea id="research-response" value={response} onChange={e => setResponse(e.target.value)} placeholder="요청 ID가 포함된 JSON 응답을 붙여넣어 주세요." style={{ minHeight: 140 }} />
          <button type="button" className="button" onClick={pasteResearch} disabled={!response.trim()}>조사 내용 가져오기</button></div>}
        <p className="small muted">형식을 읽지 못해도 원문은 지우지 않습니다. 출처 확인은 가져온 뒤 진행합니다.</p>
      </section>
    </div>
    <section className="card"><h2>확인할 주장 {project.claims.length}개</h2>
      {!project.claims.length && <p className="muted">아직 확인한 사실이 없습니다. 자료를 추가하거나 조사 요청문으로 시작해 주세요. 근거 없는 수치·비교 우위는 문구에 넣지 않습니다.</p>}
      {project.claims.map(claim => { const source = project.sources.find(s => s.id === claim.sourceId);
        return <div className="document-block" key={claim.id}><h3>{claim.statement}</h3><p className="small muted">{claim.conditions && `적용 조건: ${claim.conditions} · `}{source?.title ?? '출처 없음'} · {claim.status === 'supported' ? '직접 대조함' : '원문 확인 필요'}</p>
          {claim.quote && <blockquote className="card soft">{claim.quote}</blockquote>}
          {source?.url && <a href={source.url} target="_blank" rel="noreferrer" className="source-link">원문 링크 열기</a>}
          {source?.origin === 'external_response' && <div className="field"><label htmlFor={`original-${source.id}`}>AI가 제시한 인용문입니다. 실제 원문을 열어 본문을 붙여넣어 주세요.</label>
            <textarea id={`original-${source.id}`} value={originals[source.id] || ''} onChange={e => setOriginals(old => ({ ...old, [source.id]: e.target.value }))} />
            <label className="row"><input type="checkbox" checked={publication[source.id] || false} onChange={e => setPublication(old => ({ ...old, [source.id]: e.target.checked }))} />공개 문구의 근거로 사용해도 됩니다</label>
            <button type="button" className="button secondary" onClick={() => { try { update(attachOriginalText(project, source.id, originals[source.id] || '', publication[source.id] || false)); setError(''); setNotice('원문을 연결했습니다. 해당 문장이 실제 주장을 뒷받침하는지 다시 판단해 주세요.'); } catch (cause) { setError(cause instanceof Error ? cause.message : '원문을 확인하지 못했어요.'); } }}>원문 연결하기</button>
          </div>}
          {claim.status !== 'supported' && source?.origin !== 'external_response' && <p><button type="button" className="button secondary" onClick={() => confirmClaim(claim.id)}>원문과 직접 대조했어요</button></p>}
        </div>;
      })}
    </section>
    <div className="grid">
      <section className="card"><h2>고객이 궁금해하는 것</h2>{project.questions.length ? <ul className="list">{project.questions.map(q => <li key={q.id}>{q.text} <span className="badge">{q.provenance === 'observed' ? '관찰' : q.provenance === 'reconstructed' ? '자료로 재구성' : '가설'}</span></li>)}</ul> : <p className="muted">조사한 질문이 없습니다. 고객 상황을 임의의 검색량으로 포장하지 않습니다.</p>}</section>
      <section className="card"><h2>경쟁 제품과 선택 이유</h2>{project.comparisons.map(c => <p key={c.id}><strong>{c.competitor}</strong> · {c.criterion}<br /><span className="small muted">{c.comparable ? c.reason : '같은 조건으로 확인하지 못했습니다. ' + c.reason}</span></p>)}
        {project.recommendations.map(r => <div key={r.id} className="document-block"><strong>{r.situation}</strong>
          <span className="badge warn">외부 조사에서 제안한 선택 이유</span><p>{r.reason}</p>
          <p className="small muted">{r.claimIds.length && r.claimIds.every(id => project.claims.find(c => c.id === id)?.status === 'supported') ? '연결된 자사 주장의 원문은 직접 대조했습니다. 고객 적합성과 비교 조건은 별도 검토가 필요합니다.' : '연결된 주장 또는 고객 적합성을 아직 확인하지 않았습니다.'}</p>
          <p className="small muted">한계: {r.limitation || '자료로 확인할 내용이 남아 있습니다.'}</p></div>)}
        {!project.comparisons.length && !project.recommendations.length && <p className="muted">비교할 자료를 아직 찾지 못했습니다. 자사 특징을 경쟁 우위로 단정하지 않습니다.</p>}</section>
    </div>
    <div className="sticky-actions"><Link href="/results" className="button">근거 확인 후 문구 만들기</Link></div>
  </>;
}
