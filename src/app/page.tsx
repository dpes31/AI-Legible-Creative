'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { channels, channelNames, newProject, type Channel, type Objective, type ProductCategory } from '@/domain/schema';
import { listBrandProfiles, loadBriefDraft, loadProject, moveBriefDraft, preserveConflictDraft, RevisionConflict, saveBrandProfile, saveBriefDraft, type BriefDraft } from '@/data/repository';
import { newBrandProfile, type BrandProfile } from '@/domain/portfolio';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import styles from '@/features/brief/BriefStart.module.css';

const defaultChannels = channels.filter(channel => channel !== 'review_video');

export default function Home() {
  const router = useRouter();
  const { project, loading, create, update, flush } = useWorkspace();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'brand' | 'product' | 'service'>('product');
  const [model, setModel] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [brandName, setBrandName] = useState('');
  const [category, setCategory] = useState<ProductCategory>('unknown');
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState<Objective>('sales');
  const [audience, setAudience] = useState('');
  const [audienceUndecided, setAudienceUndecided] = useState(true);
  const [officialUrl, setOfficialUrl] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>([...defaultChannels]);
  const [mode, setMode] = useState<'manual' | 'automatic'>('manual');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftKey, setDraftKey] = useState('new');
  const [draftState, setDraftState] = useState<'saving' | 'saved' | 'error'>('saved');
  const draftRevision = useRef<number | null>(null);
  const draftId = useRef(crypto.randomUUID());
  const draftQueue = useRef<Promise<void>>(Promise.resolve());
  const draftFailed = useRef(false);
  const draftError = useRef('');
  const currentProject = useRef(project);
  useEffect(() => { currentProject.current = project; }, [project]);

  useEffect(() => {
    if (loading) return;
    void listBrandProfiles().then(setBrands).catch(() => setMessage('브랜드 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'));
    let cancelled = false;
    const preferred = localStorage.getItem('alc-brief-focus-v1');
    const activeProject = project;
    const key = preferred === 'new' || !activeProject ? 'new' : `project:${activeProject.id}`;
    void (async () => {
      try {
        const draft = await loadBriefDraft(key);
        if (cancelled) return;
        const input = draft?.input ?? (key !== 'new' ? activeProject : null);
        if (input) {
          setName(input.name); setKind(input.kind); setModel(input.model); setDescription(input.description);
          setBrandId(input.brandId ?? null); setBrandName(input.brandName ?? ''); setCategory(input.category ?? 'unknown');
          setObjective(input.objective); setAudience(input.audience); setAudienceUndecided(input.audienceUndecided);
          setOfficialUrl(input.officialUrl); setSelectedChannels(input.selectedChannels); setMode(input.mode);
        }
        draftRevision.current = draft?.revision ?? null;
        draftId.current = draft?.draftId || crypto.randomUUID();
        setDraftKey(key); setEditing(key !== 'new' && !!activeProject); setDraftReady(true);
      } catch (cause) { if (!cancelled) { setDraftState('error'); setMessage(cause instanceof Error ? cause.message : '입력을 불러오지 못했어요.'); } }
    })();
    return () => { cancelled = true; };
  }, [loading, project]);

  useEffect(() => {
    if (!draftReady) return;
    const input: BriefDraft['input'] = { name, kind, model, brandId, brandName, category, description, officialUrl, objective, audience,
      audienceUndecided, selectedChannels, mode };
    const key = draftKey; const id = draftId.current;
    draftFailed.current = false;
    draftQueue.current = draftQueue.current.then(async () => {
      setDraftState('saving');
      try {
        const saved = await saveBriefDraft({ key, draftId: id, projectId: key.startsWith('project:') ? key.slice(8) : null,
          revision: draftRevision.current ?? 0, updatedAt: new Date().toISOString(), input }, draftRevision.current);
        draftRevision.current = saved.revision;
        setDraftState('saved');
      } catch (cause) {
        draftFailed.current = true; setDraftState('error');
        const active = currentProject.current;
        if (cause instanceof RevisionConflict && cause.recoveryId && active && key === `project:${active.id}`) {
          try { await preserveConflictDraft(cause.recoveryId, { ...active, ...input }); }
          catch { draftError.current = '충돌한 입력을 보관하지 못했어요. 현재 내용을 복사해 주세요.'; setMessage(draftError.current); return; }
        }
        draftError.current = cause instanceof Error ? cause.message : '입력을 저장하지 못했어요. 현재 내용을 복사해 보관해 주세요.';
        setMessage(draftError.current);
      }
    });
  }, [draftReady, draftKey, name, kind, model, brandId, brandName, category, description, officialUrl, objective, audience, audienceUndecided, selectedChannels, mode]);

  const editCurrent = () => {
    if (!project) return;
    setEditing(true); setMessage('대상 이름·모델·기존 공식 링크를 바꾸면 자료가 섞이지 않도록 새 작업으로 만듭니다.');
  };

  const toggle = (channel: Channel) => setSelectedChannels(current => current.includes(channel) ? current.filter(x => x !== channel) : [...current, channel]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || !draftReady || pending) return;
    if (!name.trim() || (!audienceUndecided && !audience.trim()) || !selectedChannels.length) {
      setMessage('대상, 고객 상황 또는 ‘아직 정하지 않았어요’, 결과물 한 가지 이상을 선택해 주세요.'); return;
    }
    setPending(true); setMessage('');
    try {
      await draftQueue.current;
      if (draftFailed.current) throw new Error(draftError.current || '입력을 저장하지 못했어요. 현재 내용을 보관해 주세요.');
      setDraftReady(false);
      if (!brandId && brandName.trim() && brands.some(item => item.name === brandName.trim())) {
        throw new Error('같은 이름의 브랜드가 이미 있습니다. 기존 브랜드를 선택하거나 정확한 이름을 확인해 주세요.');
      }
      let selectedBrandId = brandId;
      let selectedBrand = brands.find(item => item.id === brandId);
      if (!brandId && brandName.trim()) {
        const saved = await saveBrandProfile(newBrandProfile(brandName.trim()), null);
        selectedBrand = saved; selectedBrandId = saved.id; setBrands(current => [...current, saved]); setBrandId(saved.id);
      }
      const youtubePrefix = category === 'berex' ? selectedBrand?.youtubePrefix?.berex :
        category === 'environment' || category === 'wearable' ? selectedBrand?.youtubePrefix?.[category] : null;
      const input = { name: name.trim(), kind, model: kind === 'product' ? model.trim() : '', description: description.trim(), officialUrl: officialUrl.trim(),
        objective, audience: audience.trim(), audienceUndecided, selectedChannels, mode, brandId: selectedBrandId,
        brandName: brandName.trim(), category, youtubePrefix: youtubePrefix || null, brandRuleRevision: selectedBrand?.revision || 0 };
      if (editing && project && project.name === input.name && project.kind === input.kind && project.model === input.model &&
          project.brandId === input.brandId) {
        const latest = await loadProject(project.id);
        if (!latest || latest.revision !== project.revision) {
          const recoveryId = crypto.randomUUID();
          await preserveConflictDraft(recoveryId, { ...project, ...input });
          throw new RevisionConflict(recoveryId);
        }
        const analyticalChange = project.objective !== input.objective || project.audience !== input.audience ||
          project.audienceUndecided !== input.audienceUndecided || project.description !== input.description ||
          project.officialUrl !== input.officialUrl || project.category !== input.category;
        update({ ...project, ...input, inputRevision: project.inputRevision + 1,
          evidenceRevision: project.evidenceRevision + (analyticalChange ? 1 : 0),
          manualResearchRequestId: null, manualContentRequestId: null,
          analysisHistory: analyticalChange ? [...project.analysisHistory, { inputRevision: project.inputRevision,
            evidenceRevision: project.evidenceRevision, at: new Date().toISOString(), questions: project.questions,
            comparisons: project.comparisons, recommendations: project.recommendations,
            researchInsights: project.researchInsights }] : project.analysisHistory,
          questions: analyticalChange ? [] : project.questions,
          comparisons: analyticalChange ? [] : project.comparisons,
          recommendations: analyticalChange ? [] : project.recommendations,
          researchInsights: analyticalChange ? { questionClusters: [], unmetNeeds: [], productCandidates: [], existingContent: [] } : project.researchInsights,
          documents: analyticalChange ? Object.fromEntries(Object.entries(project.documents).map(([key, doc]) =>
            [key, doc && { ...doc, status: 'stale' }])) as typeof project.documents : project.documents });
        await flush();
      } else {
        const next = newProject(input);
        await create(next);
        await moveBriefDraft(draftKey, `project:${next.id}`, next.id);
        localStorage.setItem('alc-brief-focus-v1', `project:${next.id}`);
      }
      setEditing(false); router.push('/review');
    } catch (cause) { setDraftReady(true); setMessage(cause instanceof Error ? cause.message : '작업을 만들지 못했어요.'); }
    finally { setPending(false); }
  };

  return <>
    {!loading && project && <div className={`card row ${styles.resume}`}>
      <div className={styles.resumeTitle}><span className="eyebrow">이어서 작업하기</span><strong>{project.name}{project.model ? ` · ${project.model}` : ''}</strong></div>
      <button className="button secondary" type="button" onClick={editCurrent}>입력 고치기</button><Link className="button secondary" href="/review">이어서 분석하기</Link><Link className="button secondary" href="/results">결과 확인하기</Link>
      <button className="button text" type="button" onClick={() => { void (async () => {
        await draftQueue.current;
        if (draftFailed.current) return;
        localStorage.setItem('alc-brief-focus-v1', 'new'); setDraftReady(false);
        const saved = await loadBriefDraft('new');
        draftRevision.current = saved?.revision ?? null; draftId.current = saved?.draftId || crypto.randomUUID();
        setDraftKey('new'); setName(saved?.input.name || ''); setKind(saved?.input.kind || 'product');
        setModel(saved?.input.model || ''); setDescription(saved?.input.description || ''); setOfficialUrl(saved?.input.officialUrl || '');
        setBrandId(saved?.input.brandId ?? null); setBrandName(saved?.input.brandName || ''); setCategory(saved?.input.category || 'unknown');
        setObjective(saved?.input.objective || 'sales'); setAudience(saved?.input.audience || '');
        setAudienceUndecided(saved?.input.audienceUndecided ?? true); setSelectedChannels(saved?.input.selectedChannels || [...defaultChannels]);
        setMode(saved?.input.mode || 'manual'); setEditing(false); setMessage('새 작업의 입력을 보관합니다. 기존 작업은 그대로 남아 있어요.'); setDraftReady(true);
      })(); }}>새 작업 시작</button>
    </div>}
    <div className={styles.workspace}>
      <section className={styles.intro} aria-labelledby="brief-heading">
        <div className={styles.kicker}><span aria-hidden="true" />근거에서 시작하는 브랜드 콘텐츠</div>
        <h1 id="brief-heading">선택할 이유를 찾고,<br /><span>설득하는 문구로.</span></h1>
        <p className={styles.lead}>우리 브랜드를 찾는 고객의 질문부터<br className={styles.desktopBreak} /> 경쟁 제품과의 차이까지.<br />확인한 근거를 채널에 맞는 문구로 다듬습니다.</p>
        <div className={styles.process} aria-label="문구를 만드는 기준">
          <div><span className={styles.processMark} aria-hidden="true">01</span><p><strong>사실을 확인하고</strong><span>원문과 조건을 함께 살펴봅니다.</span></p></div>
          <div><span className={styles.processMark} aria-hidden="true">02</span><p><strong>선택할 이유를 찾고</strong><span>고객에게 의미 있는 차이를 정리합니다.</span></p></div>
          <div><span className={styles.processMark} aria-hidden="true">03</span><p><strong>채널에 맞춰 씁니다</strong><span>다섯 기본 문서와 선택한 후기 영상까지.</span></p></div>
        </div>
        <p className={styles.localNote}>현재 작업은 이 브라우저에 저장됩니다.<br /><Link href="/settings">설정에서 백업 파일 받기</Link></p>
      </section>
      <form className={`card ${styles.form}`} onSubmit={submit} aria-labelledby="form-heading">
        <div className={styles.formHeading}><div><p className="eyebrow">{editing ? '입력 수정' : '새 작업'}</p><h2 id="form-heading">{editing ? '필요한 정보만 바꾸세요.' : '세 가지만 알려 주세요.'}</h2></div><span className={styles.formMark} aria-hidden="true">↗</span></div>
        <fieldset disabled={loading || !draftReady || pending} className={styles.fields}>
        <div className={styles.group}>
          <div className="field"><label htmlFor="entity"><span className={styles.number}>01</span>무엇을 알리고 싶으신가요?</label>
            <input id="entity" value={name} onChange={event => setName(event.target.value)} placeholder="브랜드·제품·서비스 이름" required /></div>
          <fieldset className={styles.kind}><legend className="sr-only">대상 구분</legend>
            {([['product', '제품'], ['service', '서비스'], ['brand', '브랜드']] as const).map(([value, label]) => <label key={value} className={kind === value ? styles.selected : ''}>
              <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} /><span>{label}</span>
            </label>)}
          </fieldset>
        </div>
        <div className={styles.group}>
          <div className="field"><label htmlFor="objective"><span className={styles.number}>02</span>이번 문구로 무엇을 이루고 싶으신가요?</label>
            <select id="objective" value={objective} onChange={event => setObjective(event.target.value as Objective)}>
              <option value="sales">구매·문의 늘리기</option><option value="feature">제품 특징 알리기</option><option value="trust">브랜드 신뢰 높이기</option>
            </select></div>
        </div>
        <div className={styles.group}>
          <div className="field"><label htmlFor="audience"><span className={styles.number}>03</span>주로 누가, 어떤 상황에서 찾나요?</label>
            <input id="audience" value={audience} onChange={event => { setAudience(event.target.value); setAudienceUndecided(!event.target.value.trim()); }} placeholder="예: 출퇴근길에 보온컵을 들고 다니는 사람" aria-describedby="audience-help" />
            <label className={`row ${styles.undecided}`}><input type="checkbox" checked={audienceUndecided} onChange={event => setAudienceUndecided(event.target.checked)} />아직 정하지 않았어요</label>
            <p id="audience-help" className={styles.fieldHelp}>{audienceUndecided ? '미정으로 시작합니다. 고객 상황은 조사하며 구체화할 수 있어요.' : '입력한 상황을 기준으로 조사합니다.'}</p>
          </div>
        </div>
      <details className={styles.more}><summary>자료 더하기 · 결과물 선택 <span className={styles.optional}>선택 사항</span></summary>
        {kind === 'product' && <div className="field"><label htmlFor="model">정확한 모델명, 있다면</label>
          <input id="model" value={model} onChange={event => setModel(event.target.value)} placeholder="예: 2026년형 A100" /></div>}
        <div className="field"><label htmlFor="brand">소속 브랜드, 있다면</label>
          <select id="brand" value={brandId || (brandName ? 'new' : '')} onChange={event => {
            const selected = brands.find(item => item.id === event.target.value);
            setBrandId(selected?.id || null); setBrandName(selected?.name || '');
          }}><option value="">아직 지정하지 않음</option>
            {brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            <option value="new">새 브랜드 추가</option></select>
          {!brandId && <input aria-label="새 브랜드 이름" value={brandName} onChange={event => setBrandName(event.target.value)} placeholder="예: 코웨이" />}
          <p className="small muted">브랜드를 명시적으로 연결한 프로젝트끼리만 자산을 재사용합니다.</p></div>
        {kind === 'product' && <div className="field"><label htmlFor="category">제품군</label><select id="category" value={category} onChange={event => setCategory(event.target.value as ProductCategory)}>
          <option value="unknown">아직 분류하지 않음</option><option value="berex">비렉스</option>
          <option value="environment">환가전</option><option value="wearable">웨어러블로봇</option><option value="other">기타</option>
        </select></div>}
        <div className="field"><label htmlFor="description">한 줄 설명 또는 강조하고 싶은 특징</label>
          <textarea id="description" value={description} onChange={event => setDescription(event.target.value)} placeholder="입력한 장점은 확인할 주장으로 다룹니다." /></div>
        <div className="field"><label htmlFor="official-url">공식 제품·서비스 링크</label>
          <input id="official-url" type="url" value={officialUrl} onChange={event => setOfficialUrl(event.target.value)} placeholder="https://" /></div>
        <fieldset className="field"><legend className="field-label">필요한 결과물</legend>
          {channels.map(channel => <label key={channel} className="row"><input type="checkbox" checked={selectedChannels.includes(channel)} onChange={() => toggle(channel)} />{channelNames[channel]}</label>)}
        </fieldset>
      </details>
      <fieldset className={styles.mode}><legend>작업 방식</legend>
        <div className={styles.modeChoices}>
          <label className={mode === 'manual' ? styles.selected : ''}><input type="radio" name="mode" checked={mode === 'manual'} onChange={() => setMode('manual')} /><span>외부 AI로 직접<small>API 없이 이용</small></span></label>
          <label className={mode === 'automatic' ? styles.selected : ''}><input type="radio" name="mode" checked={mode === 'automatic'} onChange={() => setMode('automatic')} /><span>앱에서 자동으로<small>연결 필요</small></span></label>
        </div>
        {mode === 'automatic' && <p role="status" className={styles.fieldHelp}>아직 자동 실행을 연결하지 않았습니다. 입력은 보관하고, 다음 화면에서 외부 AI로 직접 진행할 수 있어요.</p>}
      </fieldset>
      {message && <p role="alert" className="alert">{message}</p>}
      <p role="status" className="small muted">{draftState === 'saving' ? '입력 저장 중…' : draftState === 'error' ? '입력을 저장하지 못했어요.' : '입력 저장됨'}</p>
      <button className={`button ${styles.submit}`} type="submit" disabled={loading || pending}>{pending ? '저장 중…' : editing ? '바뀐 입력 저장하기' : '브랜드 분석 시작'}<span aria-hidden="true">→</span></button>
      <p className={styles.submitNote}>아는 만큼만 적어 주세요. 자료는 다음 화면에서도 더할 수 있어요.</p>
      </fieldset>
    </form>
    </div>
    <section className={styles.deliverables} aria-labelledby="deliverables-heading"><div><p className="eyebrow">필요한 채널에 바로</p><h2 id="deliverables-heading">하나의 분석, 필요한 문구로</h2><p className="muted small">다섯 기본 채널과 선택할 수 있는 후기 영상. 각각 수정하고 복사하세요.</p></div>
      <ul>{channels.map((channel, index) => <li key={channel}><span aria-hidden="true">0{index + 1}</span>{channelNames[channel]}</li>)}</ul>
    </section>
  </>;
}
