'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from './WorkspaceProvider';

const steps = [
  { href: '/', name: '1. 정보 입력' },
  { href: '/review', name: '2. 분석 확인' },
  { href: '/results', name: '3. 결과 받기' },
];

export function Header() {
  const path = usePathname();
  const { project, projects, select, saveState, error, clearError } = useWorkspace();
  return <>
    <header className="site-header">
      <div className="container header-row">
        <Link href="/" className="brand">ORIGIN <span>근거 있는 브랜드 문구</span></Link>
        <div className="header-actions">
          <label htmlFor="project-switch">작업</label>
          <select id="project-switch" value={project?.id ?? ''} onChange={event => void select(event.target.value)}>
            {!project && <option value="">새 작업</option>}
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Link href="/settings" className="quiet-link">설정</Link>
        </div>
      </div>
    </header>
    <nav className="container step-nav" aria-label="작업 단계">
      {steps.map(step => <Link key={step.href} href={step.href} aria-current={path === step.href ? 'step' : undefined}
        className={path === step.href ? 'step active' : 'step'}>{step.name}</Link>)}
      <span className="save-indicator" role="status">{saveState === 'saving' ? '저장 중' : saveState === 'error' ? '저장하지 못함' : '저장됨'}</span>
    </nav>
    {error && <div className="container alert" role="alert">{error} <button type="button" onClick={clearError}>닫기</button></div>}
  </>;
}
