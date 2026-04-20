'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, CheckSquare, FileText, Database, Settings, BrainCircuit } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { label: '대시보드 개요', href: '/', icon: LayoutDashboard },
  { label: 'AI 가이드 산출물', href: '/extract', icon: BrainCircuit },
  { label: '카피 검증 (수동)', href: '/validation', icon: CheckSquare },
  { label: '콘텐츠 패키징', href: '/export', icon: FileText },
  { label: '브랜드 메모리 DB', href: '/db', icon: Database },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="w-64 bg-[var(--surface-low)] border-r border-[var(--outline-variant)] h-[calc(100vh-4rem)] flex flex-col pt-6 shrink-0 sticky top-16">
      <div className="px-4 pb-4 text-xs font-semibold text-gray-500 tracking-wider uppercase">
        워크스페이스
      </div>
      <div className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-[var(--surface-lowest)] text-[var(--primary)] ghost-border shadow-sm" 
                  : "text-gray-600 hover:bg-[var(--surface-lowest)] hover:text-gray-900"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
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
          설정
        </Link>
      </div>
    </nav>
  );
}
