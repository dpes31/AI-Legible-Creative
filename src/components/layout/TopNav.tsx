import React from 'react';
import { Bell, Search, User } from 'lucide-react';

export function TopNav() {
  return (
    <header className="h-16 border-b border-[var(--outline-variant)] bg-[var(--surface-lowest)] px-6 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-4">
        {/* Brand Logo */}
        <div className="font-bold text-xl tracking-tighter text-[var(--primary)] flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)]"></div>
          ORIGIN
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="프로젝트 검색..." 
            className="pl-9 pr-4 py-2 bg-[var(--surface-low)] border-none rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] w-64"
          />
        </div>
        
        <button className="text-gray-500 hover:text-[var(--foreground)] transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute 0 top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        <div className="w-8 h-8 rounded-full bg-[var(--surface-low)] flex items-center justify-center border ghost-border cursor-pointer">
          <User className="w-4 h-4 text-gray-600" />
        </div>
      </div>
    </header>
  );
}
