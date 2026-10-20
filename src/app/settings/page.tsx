'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { downloadBlob } from '@/lib/export';

export default function SettingsPage() {
  const { project, restore, restoreLegacy, saveState } = useWorkspace();
  const [message, setMessage] = useState('');
  const [legacyMessage, setLegacyMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const backup = () => {
    if (!project) return;
    downloadBlob(`${project.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 35) || '작업'}_백업.json`,
      new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' }));
    setMessage('현재 브라우저의 작업 백업을 받았습니다. 보관 위치를 확인해 주세요.');
  };
  const backupLegacy = () => {
    const raw = localStorage.getItem('origin-mvp-store');
    if (!raw) { setMessage('이 브라우저에서 이전 자료를 찾지 못했습니다.'); return; }
    downloadBlob('origin_legacy_original.json', new Blob([raw], { type: 'application/json;charset=utf-8' }));
    setMessage('이전 자료 원본을 받았습니다. 새 작업과 섞이지 않도록 보관해 주세요.');
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
    {message && <p className="alert" role="status">{message}</p>}
    <div className="grid"><section className="card"><h2>작업 백업</h2><p>현재 작업: {project?.name || '선택한 작업 없음'} · {saveState === 'saved' ? '저장됨' : saveState === 'saving' ? '저장 중' : '저장 실패'}</p>
      <div className="row"><button className="button" type="button" disabled={!project || saveState !== 'saved'} onClick={backup}>현재 작업 백업 받기</button>
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
