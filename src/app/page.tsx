'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { channels, channelNames, newProject, type Channel, type Objective } from '@/domain/schema';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';

export default function Home() {
  const router = useRouter();
  const { project, loading, create } = useWorkspace();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'brand' | 'product' | 'service'>('product');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState<Objective>('sales');
  const [audience, setAudience] = useState('');
  const [audienceUndecided, setAudienceUndecided] = useState(true);
  const [officialUrl, setOfficialUrl] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>([...channels]);
  const [mode, setMode] = useState<'manual' | 'automatic'>('manual');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  const toggle = (channel: Channel) => setSelectedChannels(current => current.includes(channel) ? current.filter(x => x !== channel) : [...current, channel]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || (!audienceUndecided && !audience.trim()) || !selectedChannels.length) {
      setMessage('대상, 고객 상황 또는 ‘아직 정하지 않았어요’, 결과물 한 가지 이상을 선택해 주세요.'); return;
    }
    setPending(true); setMessage('');
    try {
      const next = newProject({ name: name.trim(), kind, description: description.trim(), officialUrl: officialUrl.trim(),
        objective, audience: audience.trim(), audienceUndecided, selectedChannels, mode });
      await create(next); router.push('/review');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '작업을 만들지 못했어요.'); }
    finally { setPending(false); }
  };

  return <>
    <section className="hero"><div className="eyebrow">브랜드 콘텐츠 제작</div>
      <h1>선택할 이유부터 확인하고<br />문구를 만드세요.</h1>
      <p className="muted">고객의 질문, 경쟁 제품과의 차이, 확인할 근거를 한 번에 정리합니다. 검색·AI의 추천이나 학습을 보장하지는 않습니다.</p>
    </section>
    {!loading && project && <div className="card soft row">
      <div style={{ flex: 1 }}><strong>진행 중인 작업: {project.name}</strong><p className="small muted">입력과 작성한 내용은 이 브라우저에 남아 있습니다.</p></div>
      <Link className="button secondary" href="/review">이어서 분석하기</Link><Link className="button secondary" href="/results">결과 확인하기</Link>
    </div>}
    <div className="grid"><form className="card" onSubmit={submit}>
      <h2>새 작업 만들기</h2>
      <div className="field"><label htmlFor="entity">무엇을 알리고 싶으신가요?</label>
        <input id="entity" value={name} onChange={event => setName(event.target.value)} placeholder="정확한 브랜드 또는 제품 이름" required /></div>
      <div className="field"><label htmlFor="kind">대상 구분</label><select id="kind" value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
        <option value="product">제품</option><option value="service">서비스</option><option value="brand">브랜드</option>
      </select></div>
      <div className="field"><label htmlFor="objective">이번 문구로 무엇을 이루고 싶으신가요?</label>
        <select id="objective" value={objective} onChange={event => setObjective(event.target.value as Objective)}>
          <option value="sales">구매·문의 늘리기</option><option value="feature">제품 특징 알리기</option><option value="trust">브랜드 신뢰 높이기</option>
        </select></div>
      <div className="field"><label htmlFor="audience">주로 누가, 어떤 상황에서 찾나요?</label>
        <input id="audience" value={audience} disabled={audienceUndecided} onChange={event => setAudience(event.target.value)} placeholder="예: 출퇴근길에 휴대할 보온컵을 찾는 사람" />
        <label className="row"><input type="checkbox" checked={audienceUndecided} onChange={event => setAudienceUndecided(event.target.checked)} />아직 정하지 않았어요</label>
      </div>
      <details><summary>자료와 결과물 선택하기</summary>
        <div className="field"><label htmlFor="description">한 줄 설명 또는 강조하고 싶은 특징</label>
          <textarea id="description" value={description} onChange={event => setDescription(event.target.value)} placeholder="입력한 장점은 확인할 주장으로 다룹니다." /></div>
        <div className="field"><label htmlFor="official-url">공식 제품·서비스 링크</label>
          <input id="official-url" type="url" value={officialUrl} onChange={event => setOfficialUrl(event.target.value)} placeholder="https://" /></div>
        <fieldset className="field"><legend className="field-label">필요한 결과물</legend>
          {channels.map(channel => <label key={channel} className="row"><input type="checkbox" checked={selectedChannels.includes(channel)} onChange={() => toggle(channel)} />{channelNames[channel]}</label>)}
        </fieldset>
      </details>
      <fieldset className="field"><legend className="field-label">작업 방식</legend>
        <label className="row"><input type="radio" name="mode" checked={mode === 'manual'} onChange={() => setMode('manual')} />외부 AI로 직접 — API 없이 이용</label>
        <label className="row"><input type="radio" name="mode" checked={mode === 'automatic'} onChange={() => setMode('automatic')} />앱에서 자동으로 — 연결 필요</label>
        {mode === 'automatic' && <p className="small muted">유료 호출은 현재 꺼져 있습니다. 입력 후 수동 방식으로 바꿔 계속할 수 있습니다.</p>}
      </fieldset>
      {message && <p role="alert" className="alert">{message}</p>}
      <div className="sticky-actions"><button className="button" type="submit" disabled={pending}>{pending ? '저장 중…' : '브랜드 분석 시작'}</button></div>
    </form>
    <aside className="card soft"><h2>이렇게 진행됩니다</h2><ol className="list">
      <li><strong>정보 입력</strong> — 이름, 목적, 고객 상황만 먼저 적습니다.</li>
      <li><strong>분석 확인</strong> — 출처와 비교 가능한 선택 이유를 확인합니다.</li>
      <li><strong>결과 받기</strong> — 필요한 채널을 따로 수정하고 복사합니다.</li>
    </ol><hr className="divider" />
    <h3>자료가 없어도 시작할 수 있나요?</h3><p>시작할 수 있습니다. 숫자·효능·인증처럼 근거가 필요한 내용은 확인될 때까지 보류합니다.</p>
    <h3>이 브라우저에만 저장되나요?</h3><p>현재 수동 검수판의 내용은 이 브라우저에 저장됩니다. 설정에서 백업 파일을 받아 둘 수 있습니다.</p>
    </aside></div>
  </>;
}
