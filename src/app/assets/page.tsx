'use client';

import Link from 'next/link';
import { useState } from 'react';
import { channelNames, type Channel } from '@/domain/schema';
import { improvementSuggestions, importSameModelEvidence, recordPublication, saveQuestionAnswer, verifyPublicationText } from '@/domain/assets';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { observationSummary, recordObservation } from '@/domain/observation';

export default function AssetsPage() {
  const { project, projects, loading, update } = useWorkspace();
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [channel, setChannel] = useState<Channel>('ad_copy');
  const [url, setUrl] = useState(''); const [posted, setPosted] = useState('');
  const [answer, setAnswer] = useState(''); const [questionId, setQuestionId] = useState('');
  const [trialKind, setTrialKind] = useState<'prepublish' | 'postpublish'>('prepublish');
  const [trialQuestion, setTrialQuestion] = useState(''); const [trialAnswer, setTrialAnswer] = useState('');
  const [trialPlatform, setTrialPlatform] = useState(''); const [trialUrl, setTrialUrl] = useState('');
  const [trialResult, setTrialResult] = useState<'failed' | 'none' | 'mention' | 'recommend' | 'first'>('none');
  const act = (fn: () => void, message: string) => { try { fn(); setError(''); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '내용을 확인해 주세요.'); } };
  if (loading) return <p role="status">자산을 불러오는 중입니다…</p>;
  if (!project) return <div className="card"><h1>먼저 작업을 열어 주세요.</h1><Link href="/">정보 입력하기</Link></div>;
  const related = projects.filter(item => item.id !== project.id && !!item.brandId && item.brandId === project.brandId);
  const activeChannel = project.selectedChannels.includes(channel) ? channel : project.selectedChannels[0];
  const suggestions = improvementSuggestions(project);
  return <>
    <section className="hero"><p className="eyebrow">브랜드 자산 · 보조 화면</p><h1>질문과 게시 콘텐츠를 이어 보세요.</h1>
      <p className="muted">{project.brandName || project.name}의 답변과 게시 URL을 쌓고, 아직 확인하지 못한 부분을 다음 작업으로 남깁니다.</p>
      <Link className="quiet-link" href="/results">결과로 돌아가기 ↗</Link></section>
    {error && <p role="alert" className="alert">{error}</p>}{notice && <p role="status" className="small">{notice}</p>}
    <section className="card"><h2>질문별 답변</h2>
      {project.questions.length ? <><div className="field"><label htmlFor="asset-question">고객 질문</label><select id="asset-question" value={questionId} onChange={event => {
        setQuestionId(event.target.value); setAnswer(project.questionAnswers.find(item => item.questionId === event.target.value)?.answer || '');
      }}><option value="">질문을 선택해 주세요</option>{project.questions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}</select></div>
        <div className="field"><label htmlFor="asset-answer">답변 초안</label><textarea id="asset-answer" value={answer} onChange={event => setAnswer(event.target.value)}
          placeholder="확인한 사실과 조건으로 답해 주세요. 새로운 사실은 근거 확인 후 문구에 넣습니다." /></div>
        <button type="button" className="button secondary" onClick={() => act(() => update(saveQuestionAnswer(project, questionId, answer, [])), '질문 답변을 초안으로 저장했습니다. 사실을 주장한다면 근거를 연결해 주세요.')}>답변 초안 저장</button>
        <ul className="list">{project.questionAnswers.map(item => <li key={item.id}>{project.questions.find(q => q.id === item.questionId)?.text || '과거 조사 질문'} · {item.answer}</li>)}</ul></>
        : <p>분석에서 조사한 질문을 가져오면 답변을 축적할 수 있습니다.</p>}
    </section>
    <section className="card"><h2>게시한 콘텐츠</h2><p className="small muted">URL을 등록해도 검색되거나 인용됐다는 뜻은 아닙니다. 게시된 본문을 확인하면 원고 버전을 연결합니다.</p>
      <div className="field"><label htmlFor="asset-channel">채널</label><select id="asset-channel" value={activeChannel} onChange={event => setChannel(event.target.value as Channel)}>
        {project.selectedChannels.map(item => <option key={item} value={item}>{channelNames[item]}</option>)}</select></div>
      <div className="field"><label htmlFor="asset-url">게시 URL</label><input id="asset-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" /></div>
      <button type="button" className="button secondary" onClick={() => act(() => update(recordPublication(project, activeChannel, url)), '게시 URL과 원고 버전을 기록했습니다. 게시본의 일치는 아직 확인하지 않았습니다.')}>게시 URL 기록</button>
      {project.publications.map(item => <details key={item.id}><summary>{channelNames[item.channel]} · {item.status === 'confirmed' ? '게시본 일치 확인' : '게시본 확인 전'} · {item.url}</summary>
        <p className="small">문서 버전 {item.documentRevision} · {item.publishedAt.slice(0, 10)} · <a href={item.url} target="_blank" rel="noreferrer">게시 페이지 열기 ↗</a></p>
        <pre className="output">{item.contentSnapshot}</pre>
        {item.status === 'reported' && <><div className="field"><label htmlFor={`posted-${item.id}`}>실제 게시한 본문 붙여넣기</label><textarea id={`posted-${item.id}`} value={posted} onChange={event => setPosted(event.target.value)} /></div>
          <button type="button" className="button secondary" onClick={() => act(() => update(verifyPublicationText(project, item.id, posted)), '게시 문구가 보관한 원고와 일치합니다. 실제 검색·인용은 별도로 관찰해야 합니다.')}>게시본과 대조</button></>}
      </details>)}
    </section>
    <section className="card"><h2>AI 정보 이해 시험 · 검색 관찰</h2>
      <p className="small muted">게시 전에는 자료를 AI에 제공해 이해를 시험합니다. 게시 후에는 일반 질문을 별도로 관찰합니다. 추천·인용 증가는 실제 답변으로 확인해야 합니다.</p>
      <div className="field"><label htmlFor="trial-kind">기록 종류</label><select id="trial-kind" value={trialKind} onChange={event => setTrialKind(event.target.value as typeof trialKind)}><option value="prepublish">게시 전 · 자료 제공 시험</option><option value="postpublish">게시 후 · 일반 질문 관찰</option></select></div>
      <div className="field"><label htmlFor="trial-question">실제로 보낸 질문</label><textarea id="trial-question" value={trialQuestion} onChange={event => setTrialQuestion(event.target.value)} /></div>
      <div className="field"><label htmlFor="trial-platform">플랫폼·모델</label><input id="trial-platform" value={trialPlatform} onChange={event => setTrialPlatform(event.target.value)} placeholder="사용한 AI 서비스와 모델" /></div>
      <div className="field"><label htmlFor="trial-answer">원본 답변 (실패한 요청은 비워 두세요)</label><textarea id="trial-answer" value={trialAnswer} onChange={event => setTrialAnswer(event.target.value)} /></div>
      <div className="field"><label htmlFor="trial-result">답변 상태</label><select id="trial-result" value={trialResult} onChange={event => setTrialResult(event.target.value as typeof trialResult)}><option value="failed">측정 실패</option><option value="none">언급 없음</option><option value="mention">언급만 있음</option><option value="recommend">적합한 선택지로 추천</option><option value="first">명시적으로 첫 추천</option></select></div>
      <div className="field"><label htmlFor="trial-citation">실제 답변에 표시된 공식 인용 URL (선택)</label><input id="trial-citation" type="url" value={trialUrl} onChange={event => setTrialUrl(event.target.value)} placeholder="https://" /></div>
      <button type="button" className="button secondary" onClick={() => act(() => update(recordObservation(project, {
        kind: trialKind, question: trialQuestion, platform: trialPlatform, model: trialPlatform, region: 'KR', search: 'unknown',
        suppliedContent: trialKind === 'prepublish', suppliedBrand: trialKind === 'prepublish', sourceRevision: trialKind === 'prepublish' ? project.evidenceRevision : null,
        status: trialResult === 'failed' ? 'failed' : 'measured', answer: trialAnswer, citedUrls: trialUrl.trim() ? [trialUrl.trim()] : [],
        mention: trialResult === 'failed' || trialResult === 'none' ? 'none' : 'neutral',
        recommended: trialResult === 'recommend' || trialResult === 'first', firstRecommended: trialResult === 'first',
        ownedCitation: !!trialUrl.trim(), citationChecked: false, note: '사용자가 수동 기록함. 실제 검색 여부와 인용 원문은 아직 대조하지 않음.',
      })), '원본 답변과 시험 조건을 기록했습니다. 인용 정확성은 별도로 확인해 주세요.')}>관찰 기록 저장</button>
      {(['prepublish', 'postpublish'] as const).map(kind => { const summary = observationSummary(project, kind); return <p className="small" key={kind}>
        {kind === 'prepublish' ? '게시 전' : '게시 후'}: {summary.status === 'not_measured' ? '아직 측정하지 않았어요' :
          `유효 답변 ${summary.denominator}건 / 시도 ${summary.attempts}건 · 언급 ${summary.mentions}/${summary.denominator} · 추천 ${summary.recommendations}/${summary.denominator} · 공식 인용 ${summary.citations}/${summary.denominator}`}
      </p>; })}
      {!!project.observations.length && <details><summary>원본 기록 {project.observations.length}건</summary>{project.observations.map(item => <div className="document-block" key={item.id}>
        <strong>{item.kind === 'prepublish' ? '게시 전 시험' : '게시 후 관찰'} · {item.at.slice(0, 10)} · {item.platform}</strong><p>{item.question}</p><pre className="output">{item.status === 'failed' ? '측정 실패' : item.answer}</pre>
        <p className="small">검색 여부: {item.search === 'unknown' ? '확인되지 않음' : item.search === 'yes' ? '검색함' : '검색하지 않음'} · {item.ownedCitation ? '공식 URL 인용 기록, 원문 미대조' : '공식 인용 기록 없음'}</p>
      </div>)}</details>}
    </section>
    <section className="card"><h2>다음에 확인할 일</h2>{suggestions.length ? <ul className="list">{suggestions.map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title}</strong><p className="small muted">{item.reason}</p></li>)}</ul>
      : <p>기록된 질문·근거·게시본에서 자동으로 찾은 보완 항목이 없습니다. 검색 성과를 뜻하지는 않습니다.</p>}
      {!!related.length && <details><summary>같은 브랜드로 연결된 다른 작업 {related.length}개</summary><ul>{related.map(item => <li key={item.id}>{item.name} · {item.model || '모델 미지정'} · 확인된 사실 {item.claims.filter(c => c.status === 'supported').length}개
        {item.name === project.name && !!project.model && item.model === project.model && item.category === project.category &&
          !!project.officialUrl && item.officialUrl === project.officialUrl && <button className="button text" type="button" onClick={() => act(() =>
            update(importSameModelEvidence(project, item)), '같은 모델의 원문을 가져왔습니다. 현재 작업에서 주장과 조건을 다시 확인해 주세요.')}>같은 모델의 원문 가져오기</button>}</li>)}</ul>
        <p className="small muted">다른 모델의 사실은 현재 원고에 자동으로 사용하지 않습니다.</p></details>}
    </section>
  </>;
}
