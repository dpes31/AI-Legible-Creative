'use client';
import { useState } from 'react';
import { type Project, type Source } from '@/domain/schema';
import { fingerprint } from '@/domain/workflow';
import { readEvidenceFile, FILE_LIMITS } from './readFile';
import { storeEvidenceSource } from '@/domain/analysis/evidence-intake';
import { SourceEvidencePanel } from './SourceEvidencePanel';
export function SourceForm({ project, update, setError, setNotice }: { project: Project; update: (p: Project) => void; setError: (s: string) => void; setNotice: (s: string) => void }) {
  const [title, setTitle] = useState(''); const [url, setUrl] = useState(''); const [body, setBody] = useState('');
  const [publicUse, setPublicUse] = useState(false); const [externalUse, setExternalUse] = useState(false);
  const [fileName, setFileName] = useState(''); const [fileLoading, setFileLoading] = useState(false);
  const [sourceType, setSourceType] = useState<Source['sourceType']>('user');
  const [retrieval, setRetrieval] = useState<Source['retrieval']>('partial');
  const [locator, setLocator] = useState(''); const [publishedAt, setPublishedAt] = useState('');
  const [interest, setInterest] = useState('미확인');
  const [publisher, setPublisher] = useState('');
  const addSource = () => {
    if (fileName && project.sources.filter(s => s.fileName).length >= FILE_LIMITS.projectFiles) { setError('프로젝트당 파일은 다섯 개까지 사용할 수 있습니다.'); return; }
    if (!title.trim() || !body.trim()) { setError('자료 이름과 실제 본문을 넣어 주세요. 링크만으로 원문 확인이 끝나지 않습니다.'); return; }
    if (body.length > FILE_LIMITS.textLength) { setError('원문이 5만 자를 넘습니다. 필요한 구간을 선택해 넣어 주세요.'); return; }
    try {
      if (url.trim()) { const parsed = new URL(url.trim()); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid url'); }
      const source: Source = {
        id: crypto.randomUUID(), projectId: project.id, title: title.trim(), url: url.trim() || null,
        excerpt: body, body, sourceType, retrieval, publisher: publisher.trim() || null,
        origin: 'direct_input', publishedAt: publishedAt || null, collectedAt: new Date().toISOString(), externalAiAllowed: externalUse,
        publicationAllowed: publicUse, fileName: fileName || undefined, hash: fingerprint(body),
      };
      update(storeEvidenceSource(project, source, { method: fileName ? 'file_text' : 'manual_excerpt',
        locator, coverage: 'excerpt', modelScope: [], conditionScope: [], interest }));
      setTitle(''); setBody(''); setFileName(''); setUrl(''); setPublisher(''); setExternalUse(false); setPublicUse(false); setError(''); setNotice('자료를 저장했습니다. 이전 조사 요청문은 무효가 되었습니다. 사실과 출처를 확인해 주세요.');
    } catch (error) { setError(error instanceof Error ? error.message : '자료를 저장하지 못했습니다.'); }
  };

  const fileChanged = async (file?: File) => {
    if (!file) return;
    if (project.sources.filter(s => s.fileName).length >= FILE_LIMITS.projectFiles) { setError('직접 올리는 자료는 다섯 개까지 사용할 수 있습니다.'); return; }
    setFileLoading(true); setError('');
    try {
      const text = await readEvidenceFile(file);
      setFileName(file.name); setTitle(file.name); setBody(text.body); setNotice(`${text.page}의 글자를 읽었습니다. 공개 사용 범위를 확인한 뒤 자료를 저장해 주세요.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '파일을 읽지 못했어요.'); }
    finally { setFileLoading(false); }
  };

  return (
      <section><h3>자료 더하기</h3><p className="muted small">원문을 붙여넣거나 글자를 선택할 수 있는 PDF를 올려 주세요. 외부 AI에 전달하는 자료는 따로 확인합니다.</p>
        <div className="field"><label htmlFor="source-title">자료 이름</label><input id="source-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 공식 제품 설명" /></div>
        <div className="field"><label htmlFor="source-url">원문 링크, 있다면</label><input id="source-url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" /></div>
        <div className="field"><label htmlFor="source-publisher">발행자 (미확인이면 비움)</label><input id="source-publisher" value={publisher} onChange={e => setPublisher(e.target.value)} placeholder="발행 주체명만 입력하고 개인 식별정보는 제외해 주세요." /></div>
        <div className="field"><label htmlFor="source-file">또는 파일로 가져오기</label><input id="source-file" type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" onChange={e => void fileChanged(e.target.files?.[0])} />
          {fileLoading && <span role="status">자료에서 글자를 읽고 있습니다…</span>}</div>
        <div className="field"><label htmlFor="source-body">실제 원문</label><textarea id="source-body" value={body} onChange={e => setBody(e.target.value)} placeholder="확인할 문장과 적용 조건을 원문 그대로 붙여넣어 주세요." /></div>
        <div className="field"><label htmlFor="source-type">자료 종류</label><select id="source-type" value={sourceType} onChange={e => setSourceType(e.target.value as Source['sourceType'])}><option value="user">사용자 자료</option><option value="official">제조사 공식 발표</option><option value="review">개인 경험 후기</option><option value="independent">독립 평가</option><option value="test">시험 원문</option></select></div>
        <div className="field"><label htmlFor="source-retrieval">수집 결과</label><select id="source-retrieval" value={retrieval} onChange={e => setRetrieval(e.target.value as Source['retrieval'])}><option value="partial">일부 원문 확보</option><option value="user_provided">사용자 제공 원문</option><option value="fetched">본문 수집 성공</option><option value="failed">수집 실패</option></select></div>
        <label className="field">확보한 본문 범위<input value={locator} onChange={e => setLocator(e.target.value)} placeholder="예: 공간 활용 단락의 첫 문장, 이미지·기타 영역 미수집" /></label>
        <label className="field">게시일 (미확인이면 비움)<input type="date" value={publishedAt} onChange={e => setPublishedAt(e.target.value)} /></label>
        <label className="field">이해관계·표본 한계<input value={interest} onChange={e => setInterest(e.target.value)} /></label>
        <label className="row small"><input type="checkbox" checked={publicUse} onChange={e => setPublicUse(e.target.checked)} />이 자료를 공개 문구의 근거로 써도 됩니다</label>
        <label className="row small"><input type="checkbox" checked={externalUse} onChange={e => setExternalUse(e.target.checked)} />이 자료를 외부 AI 조사 요청문에 넣어도 됩니다</label>
        <p className="small muted">확인하지 않은 자료는 공개 문구에 사용하지 않습니다.</p>
        <button className="button secondary" onClick={addSource} type="button">자료 저장하기</button>
        {!!project.sources.length && <details><summary>저장한 자료 {project.sources.length}개</summary><ul className="list">
          {project.sources.map(source => <li key={source.id}><strong>{source.title}</strong> · {source.retrieval === 'failed' ? '수집 실패' : source.retrieval === 'partial' ? '일부 확보' : '원문 저장'}
            {source.url && <> · <a className="source-link" href={source.url} target="_blank" rel="noreferrer">원문 열기</a></>}
            {!source.publicationAllowed && <span className="badge warn">공개 문구 사용 미확인</span>}
            <SourceEvidencePanel key={source.id} project={project} source={source} update={update} onError={setError} />
          </li>)}
        </ul></details>}
      </section>
  );
}
