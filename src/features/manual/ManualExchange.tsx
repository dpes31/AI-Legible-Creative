'use client';

import { useEffect, useRef, useState } from 'react';
import { channelNames, type Channel, type Project } from '@/domain/schema';
import { EntityMismatch, importContent, importFreeformDraft, importResearch, prepareContent, prepareResearch } from '@/domain/workflow';

type Props = { project: Project; stage: 'research' | 'content'; channels?: Channel[];
  update: (p: Project) => void; onError: (text: string) => void; onNotice: (text: string) => void };

export function ManualExchange({ project, stage, channels, update, onError, onNotice }: Props) {
  const [localError, setLocalError] = useState('');
  const [nameMismatch, setNameMismatch] = useState<EntityMismatch | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (localError) errorRef.current?.focus(); }, [localError]);
  const reportError = (cause: unknown, fallback: string) => {
    const message = cause instanceof Error ? cause.message : fallback;
    setLocalError(message); onError(message);
    setNameMismatch(cause instanceof EntityMismatch ? cause : null);
  };
  const clearError = () => { setLocalError(''); setNameMismatch(null); onError(''); };
  const research = stage === 'research';
  const requestId = research ? project.manualResearchRequestId : project.manualContentRequestId;
  const response = project.manualDrafts[stage];
  let prompt = '';
  if (requestId) {
    try { prompt = research ? prepareResearch(project).prompt : prepareContent(project).prompt; }
    catch { /* The create action below reports the actionable error. */ }
  }
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); onNotice('요청문을 복사했습니다.'); onError(''); }
    catch { onError('복사가 되지 않았어요. 요청문을 선택해 직접 복사해 주세요.'); }
  };
  const create = () => {
    try { const prepared = research ? prepareResearch(project) : prepareContent(project, channels || project.selectedChannels);
      update(prepared.project); clearError(); onNotice('요청문을 외부 AI에 보내고, 받은 응답을 아래에 붙여넣어 주세요.'); }
    catch (cause) { reportError(cause, '요청문을 만들지 못했어요.'); }
  };
  const importResponse = (confirmSameEntity = false) => {
    try { const next = research ? importResearch(project, response, confirmSameEntity) : importContent(project, response);
      update(next); clearError();
      onNotice(research ? '조사 내용을 가져왔습니다. 핵심 판단과 원문을 확인해 주세요.' : Object.keys(next.documentProposals).length
        ? '다시 쓴 문구를 새 제안으로 보관했습니다. 기존 문구와 비교한 뒤 적용해 주세요.' : '채널별 문구를 가져왔습니다. 필요한 문구부터 확인해 주세요.'); }
    catch (cause) { reportError(cause, '응답에서 필요한 항목을 찾지 못했어요.'); }
  };
  return <div className="manual-exchange">
    <p className="small muted">{research ? '조사 요청문을 외부 AI에 보내세요. 받은 응답을 한 번 붙여넣으면 분석을 확인할 수 있습니다.' : '확인한 근거와 채널별 구성을 담은 요청문입니다. 받은 응답을 붙여넣어 주세요.'}</p>
    {project.mode === 'automatic' && <p className="alert small">자동 연결 전입니다. 아래 요청문으로 직접 진행할 수 있어요.</p>}
    <button type="button" className="button secondary" onClick={create}>
      {research ? '조사 요청문 만들기' : channels?.length === 1 && project.documents[channels[0]] ? '이 채널 다시 작성하기' : '채널별 작성 요청문 만들기'}
    </button>
    {prompt && <div className="field exchange-prompt"><label htmlFor={`${stage}-prompt`}>외부 AI에 보낼 요청문</label>
      <textarea id={`${stage}-prompt`} readOnly value={prompt} />
      <button className="button text" type="button" onClick={() => void copy(prompt)}>요청문 복사</button></div>}
    {requestId && <div className="field">
      {!research && !!project.contentRequestChannels.length && <p className="small muted">이번 요청: {project.contentRequestChannels.map(c => channelNames[c]).join(' · ')}</p>}
      <label htmlFor={`${stage}-response`}>{research ? 'AI에서 받은 조사 결과 붙여넣기' : 'AI에서 받은 작성 결과 붙여넣기'}</label>
      <textarea id={`${stage}-response`} value={response} maxLength={500000} aria-invalid={!!localError} aria-describedby={localError ? `${stage}-import-error` : undefined} onChange={event => { clearError(); update({ ...project, manualDrafts: { ...project.manualDrafts, [stage]: event.target.value } }); }} placeholder="외부 AI의 응답을 그대로 붙여넣어 주세요." />
      <button type="button" className="button" onClick={() => importResponse()} disabled={!response.trim()}>{research ? '조사 내용 가져오기' : '채널별 문구 가져오기'}</button>
      {localError && <div className="alert" role="alert" id={`${stage}-import-error`}>
        <p ref={errorRef} tabIndex={-1}>{localError}</p>
        {nameMismatch && <button className="button secondary" type="button" onClick={() => importResponse(true)}>같은 제품임을 확인하고 가져오기</button>}
        {!nameMismatch && <p className="small">붙여넣은 내용은 보관돼 있어요. 아래 보완 요청문을 이용할 수 있습니다.</p>}
      </div>}
      <details><summary>응답을 가져오지 못했다면</summary><p className="small muted">원문은 이 작업에 보관됩니다. 아래 보완 요청문을 같은 AI에 보내 주세요. 내용을 임의로 고치지는 않습니다.</p>
        <textarea aria-label="보완 요청문" readOnly value={`앞서 보낸 요청문과 요청 ID ${requestId}를 유지해 주세요. ${research ? '대상·출처·주장·질문·비교·추천·부족한 자료' : '선택한 채널별 blocks와 claimRefs'} 항목이 빠지지 않게, 요청한 반환 형식으로 다시 보내 주세요. 없는 사실은 만들지 말고 자료 부족을 표시해 주세요.\n\n${prompt}`} />
        <button type="button" className="button secondary" onClick={() => void copy(`앞선 요청 ID ${requestId}를 유지하고 다음 계약에 맞춰 응답만 다시 보내 주세요. 없는 사실을 만들지 마세요.\n\n${prompt}`)}>보완 요청문 복사</button>
        {!research && channels?.length === 1 && <button type="button" className="button text" disabled={!response.trim()} onClick={() => {
          try { update(importFreeformDraft(project, channels[0], response)); onNotice('선택한 채널에 검토용 초안으로 보관했습니다.'); onError(''); }
          catch (cause) { onError(cause instanceof Error ? cause.message : '원문을 보관하지 못했어요.'); }
        }}>현재 채널의 초안으로 보관</button>}
      </details>
    </div>}
    {!requestId && response && <details><summary>직전에 붙여넣은 응답 보기</summary><textarea aria-label="보관한 원문 응답" readOnly value={response} className="editor" /></details>}
  </div>;
}
