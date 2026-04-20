'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Sparkles } from 'lucide-react';
import { useOriginStore } from '@/store/useOriginStore';

export default function Home() {
  const router = useRouter();
  const setPhase1Input = useOriginStore((state) => state.setPhase1Input);
  const [client, setClient] = useState('');
  const [usp, setUsp] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = () => {
    if (!client || !usp) return;
    setIsLoading(true);
    setPhase1Input(client, usp);
    // Move to the extraction phase
    setTimeout(() => {
      router.push('/extract');
    }, 600);
  };

  return (
    <div className="max-w-3xl mx-auto mt-12 space-y-6">
      <div className="text-center mb-10">
        <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] rounded-2xl flex items-center justify-center mb-6 shadow-glass">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)] mb-3">
          ORIGIN 프로젝트 생성
        </h1>
        <p className="text-gray-500 text-lg">
          클라이언트 정보와 핵심 소구포인트를 입력하여 AI 분석을 시작하세요.
        </p>
      </div>

      <div className="card p-8 border ghost-border shadow-ambient">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
              광고주 / 브랜드명 (Client)
            </label>
            <input 
              type="text" 
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="예: 삼성전자, 현대자동차..." 
              className="w-full bg-[var(--surface-low)] border-none rounded-xl p-4 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] transition-all"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
              핵심 소구포인트 (USP)
            </label>
            <textarea 
              value={usp}
              onChange={(e) => setUsp(e.target.value)}
              placeholder="가장 강조해야 할 제품/브랜드의 특징을 입력하세요..." 
              className="w-full h-32 bg-[var(--surface-low)] border-none rounded-xl p-4 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none transition-all"
            />
          </div>

          <button 
            onClick={handleStart}
            disabled={!client || !usp || isLoading}
            className="w-full gradient-btn py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm mt-4"
          >
            {isLoading ? (
               <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
               <Rocket className="w-5 h-5" />
            )}
            브랜드 메모리 자동 추출 시작
          </button>
        </div>
      </div>
    </div>
  );
}
