'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { listConflictDrafts, type ConflictDraft } from '@/data/repository';
import { downloadBlob } from '@/lib/export';

export default function SettingsPage() {
  const { project, restore, restoreLegacy, saveState } = useWorkspace();
  const [drafts, setDrafts] = useState<ConflictDraft[]>([]);
  const [checkedDrafts, setCheckedDrafts] = useState(false);
  const [message, setMessage] = useState('');
  const [legacyMessage, setLegacyMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const backup = () => {
    if (!project) return;
    downloadBlob(`${project.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 35) || '작업'}_백업.json`,
      new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' }));
    setMessage('백업 다운로드를 시작했습니다. 파일이 저장됐는지 확인해 주세요.');
  };
  const backupLegacy = () => {
    const raw = localStorage.getItem('origin-mvp-store');
    if (!raw) { setMessage('이 브라우저에서 이전 자료를 찾지 못했습니다.'); return; }
    downloadBlob('origin_legacy_original.json', new Blob([raw], { type: 'application/json;charset=utf-8' }));
    setMessage('이전 자료 원본의 다운로드를 시작했습니다. 파일이 저장됐는지 확인해 주세요.');
  };
  const restoreFile = async (file?: File) => {
    if (!file) return;
    try { await restore(await file.text()); setMessage('백업을 새 작업으로 가져왔습니다. 근거와 문구의 확인 상태를 살펴봐 주세요.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '백업을 읽지 못했어요. 원본은 바꾸지 않았습니다.'); }
    finally { if (input.current) input.current.value = ''; }
  };
  const restoreOldFile = async (file?: File) => {
    if (!file) return;
    try { await restoreLegacy(await file.text()); setLegacyMessage('이전 자료를 가져왔습니다. 출처·승인 상태는 다시 확인해 주세요.'); }
    catch (cause) { setLegacyMessage(cause instanceof Error ? cause.message : '이전 자료를 읽지 못했어요.'); }
  };
  return <><section className="hero"><div className="eyebrow">설정</div><h1>작업 보관과 연결 상태</h1><p className="muted">현재 수동 검수판은 이 브라우저에 저장됩니다. 다른 주소나 기기에서 이어 하려면 백업 파일을 옮겨 주세요.</p></section>
    <section className="card"><h2>다른 창과 겹친 초안</h2><p>동시에 수정해 저장이 겹친 경우, 이 창의 내용을 별도로 보관합니다. 기존 저장본은 그대로 남습니다.</p>
      <button type="button" className="button secondary" onClick={async () => { try { setDrafts(await listConflictDrafts()); setCheckedDrafts(true); } catch { setMessage('보관한 초안을 읽지 못했어요. 현재 화면의 내용을 먼저 백업해 주세요.'); } }}>보관한 초안 확인</button>
      {checkedDrafts && !drafts.length && <p role="status">보관된 충돌 초안이 없습니다.</p>}
      {drafts.map(draft => <details key={draft.id}><summary>{draft.project.name} · {new Date(draft.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</summary>
        <p className="small muted">원하는 문구를 복사해 현재 작업과 비교해 주세요. 백업 파일은 기존 작업을 자동으로 덮어쓰지 않습니다.</p>
        <button type="button" className="button secondary" onClick={() => downloadBlob(`충돌_초안_${draft.id}.json`, new Blob([JSON.stringify(draft.project, null, 2)], { type: 'application/json;charset=utf-8' }))}>초안 백업 받기</button>
        <pre className="output">{Object.values(draft.project.documents).filter(Boolean).map(doc => doc!.blocks.map(block => block.text).join('\n\n')).join('\n\n────\n\n') || draft.project.description || draft.project.name}</pre>
      </details>)}
    </section>
    {message && <p className="alert" role="status">{message}</p>}
    <div className="grid"><section className="card"><h2>작업 백업</h2><p>현재 작업: {project?.name || '선택한 작업 없음'} · {saveState === 'saved' ? '저장됨' : saveState === 'saving' ? '저장 중' : '저장 실패'}</p>
      <div className="row"><button className="button" type="button" disabled={!project} onClick={backup}>{saveState === 'saved' ? '현재 작업 백업 받기' : '저장 전 내용 백업 받기'}</button>
        <button className="button secondary" type="button" onClick={backupLegacy}>이전 자료 원본 받기</button></div>
      <hr className="divider" /><div className="field"><label htmlFor="restore-backup">이전에 받은 새 버전 백업 가져오기</label>
        <input id="restore-backup" ref={input} type="file" accept=".json,application/json" onChange={event => void restoreFile(event.target.files?.[0])} />
        <p className="small muted">같은 프로젝트가 이미 있으면 덮어쓰지 않고 안내합니다. 이전 버전 원본은 자동 이전을 통해 별도로 처리합니다.</p></div>
      <div className="field"><label htmlFor="restore-old">예전 앱의 JSON 원본 파일 가져오기</label>
        <input id="restore-old" type="file" accept=".json,application/json" onChange={event => void restoreOldFile(event.target.files?.[0])} />
        {legacyMessage && <p role="status" className="small">{legacyMessage}</p>}</div>
    </section><section className="card soft"><h2>자동 분석 연결</h2>
      <p>현재 이 화면은 외부 AI에 자동으로 자료를 보내지 않습니다. 실제 API 호출은 비용 한도와 개인 계정 설정이 끝나야 켤 수 있습니다.</p>
      <p className="small muted">서버 저장이나 자동 분석을 아직 사용하지 않는 작업은 이 브라우저에서만 볼 수 있습니다. 키를 이 화면이나 채팅에 적지 마세요.</p>
      <Link href="/" className="button secondary">정보 입력으로 돌아가기</Link></section></div>
  </>;
}
