'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Rocket,         // 입력
  Layers,          // Phase 1
  MessageSquare,   // Phase 2
  BarChart3,       // Phase 3
  FileCheck,       // Phase 4
  PenTool,         // Phase 5
  CheckSquare,     // Phase 5.6
  Package,         // Phase 6
  Settings,
} from 'lucide-react';
import { useOriginStore } from '@/store/useOriginStore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 메뉴 항목 정의 — Phase 번호와 매핑하여 진행 상태 표시
const navItems = [
  { label: '프로젝트 입력',        href: '/',           icon: Rocket,        phase: 0 },
  { label: 'Phase 1: 카테고리 추론', href: '/phase1',     icon: Layers,        phase: 1 },
  { label: 'Phase 2: 질문 역설계',   href: '/phase2',     icon: MessageSquare, phase: 2, highlight: true },
  { label: 'Phase 3: Before 측정',   href: '/phase3',     icon: BarChart3,     phase: 3 },
  { label: 'Phase 4: 사실 문장',     href: '/phase4',     icon: FileCheck,     phase: 4 },
  { label: 'Phase 5: 카피 초안',     href: '/phase5',     icon: PenTool,       phase: 5 },
  { label: 'Phase 6: 카피 검증',     href: '/validation', icon: CheckSquare,   phase: 6 },
  { label: 'Phase 7: 유통물 패키지', href: '/export',     icon: Package,       phase: 7 },
];

/**
 * 진행 상태 뱃지를 반환
 * - 완료: 초록색 체크
 * - 진행중: 파란색 깜빡임
 * - 잠금: 회색 잠금
 */
function getStatusBadge(itemPhase: number, currentPhase: number) {
  if (itemPhase < currentPhase) {
    return <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="완료" />;
  }
  if (itemPhase === currentPhase) {
    return <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" title="진행중" />;
  }
  return <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" title="대기" />;
}

export function SideNav() {
  const pathname = usePathname();
  const currentPhase = useOriginStore((state) => state.currentPhase);

  return (
    <nav className="w-64 bg-[var(--surface-low)] border-r border-[var(--outline-variant)] h-[calc(100vh-4rem)] flex flex-col pt-6 shrink-0 sticky top-16">
      <div className="px-4 pb-4 text-xs font-semibold text-gray-500 tracking-wider uppercase">
        워크플로우
      </div>
      <div className="flex-1 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                isActive
                  ? 'bg-[var(--surface-lowest)] text-[var(--primary)] ghost-border shadow-sm'
                  : 'text-gray-600 hover:bg-[var(--surface-lowest)] hover:text-gray-900',
                // Phase 2(핵심)를 시각적으로 강조
                item.highlight && !isActive && 'text-blue-600 font-semibold'
              )}
            >
              {getStatusBadge(item.phase, currentPhase)}
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate text-xs">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="p-4 mt-auto border-t border-[var(--outline-variant)]/50">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-[var(--surface-lowest)] hover:text-gray-900 transition-colors"
        >
          <Settings className="w-4 h-4" />
          API 연동 설정
        </Link>
      </div>
    </nav>
  );
}
