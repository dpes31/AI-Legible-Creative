'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { importBackup, importLegacyBackup, listProjects, loadProject, migrateLegacy, saveProject } from '@/data/repository';
import { type Project } from '@/domain/schema';

type Workspace = {
  project: Project | null; projects: Project[]; loading: boolean;
  saveState: 'saved' | 'saving' | 'error'; error: string;
  create: (project: Project) => Promise<void>; select: (id: string) => Promise<void>;
  update: (next: Project) => void; restore: (text: string) => Promise<void>; restoreLegacy: (text: string) => Promise<void>;
  refresh: () => Promise<void>; clearError: () => void;
};

const WorkspaceContext = createContext<Workspace | null>(null);
const ACTIVE_KEY = 'alc-active-project-v2';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<Workspace['saveState']>('saved');
  const [error, setError] = useState('');
  const projectRef = useRef<Project | null>(null);
  const lastRevision = useRef<number | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const blocked = useRef(false);

  const activate = useCallback((value: Project | null) => {
    projectRef.current = value; lastRevision.current = value?.revision ?? null;
    blocked.current = false; setProject(value); setSaveState('saved');
    if (value) localStorage.setItem(ACTIVE_KEY, value.id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      try { const legacy = await migrateLegacy(); if (legacy.status === 'needs_backup') setError('이전 자료를 별도 보관할 공간이 부족합니다. 설정에서 원본 파일을 먼저 받아 주세요.'); }
      catch (cause) { setError(`이전 자료를 자동으로 가져오지 못했어요. 원본은 남아 있습니다. ${cause instanceof Error ? cause.message : ''}`); }
      const items = await listProjects(); setProjects(items);
      const activeId = localStorage.getItem(ACTIVE_KEY);
      activate(items.find(item => item.id === activeId) ?? items[0] ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '프로젝트를 불러오지 못했어요.'); }
    finally { setLoading(false); }
  }, [activate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const create = async (value: Project) => {
    await queue.current;
    const saved = await saveProject(value, null);
    activate(saved); setProjects(await listProjects()); setError('');
  };

  const select = async (id: string) => {
    await queue.current;
    const value = await loadProject(id);
    if (!value) throw new Error('프로젝트를 찾지 못했어요.');
    activate(value); setError('');
  };

  const update = (next: Project) => {
    const previous = projectRef.current;
    if (!previous || previous.id !== next.id || blocked.current) return;
    projectRef.current = next; setProject(next); setSaveState('saving');
    queue.current = queue.current.then(async () => {
      if (blocked.current) return;
      try {
        const saved = await saveProject(next, lastRevision.current);
        lastRevision.current = saved.revision;
        if (projectRef.current === next) { projectRef.current = saved; setProject(saved); setSaveState('saved'); }
        setProjects(await listProjects());
      } catch (cause) {
        blocked.current = true; setSaveState('error');
        setError(cause instanceof Error ? cause.message : '저장하지 못했어요. 현재 내용을 복사해 보관해 주세요.');
      }
    });
  };

  const restore = async (text: string) => {
    await queue.current;
    const restored = await importBackup(text);
    activate(restored); setProjects(await listProjects()); setError('');
  };

  const restoreLegacy = async (text: string) => {
    await queue.current;
    const restored = await importLegacyBackup(text);
    activate(restored); setProjects(await listProjects()); setError('');
  };

  return <WorkspaceContext.Provider value={{ project, projects, loading, saveState, error, create, select, update, restore, restoreLegacy, refresh, clearError: () => setError('') }}>
    {children}
  </WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('WorkspaceProvider가 필요합니다.');
  return context;
}
