'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Sparkles } from 'lucide-react';
import { useOriginStore } from '@/store/useOriginStore';

export default function Home() {
  const router = useRouter();
  const setInput = useOriginStore((state) => state.setInput);
  const [client, setClient] = useState('');
  const [usp, setUsp] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = () => {
    if (!client || !usp) return;
    setIsLoading(true);
    setInput(client, usp);
    // Phase 1으로 이동
    setTimeout(() => {
      router.push('/phase1');
    }, 600);
  };

  return (
    <div className="max-w-3xl mx-auto mt-12 space-y-6">
      <div className="text-center mb-10">
        <div className="w-16 h-16 mx-auto bg-gradient-to-br from-[var(--primary)] to-[var(--primary-container)] rounded-2xl flex items-center justify-center mb-6 shadow-glass">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)] mb-3">
          ORIGIN — AI-Legible Creative
        </h1>
        <p className="text-gray-500 text-base leading-relaxed max-w-xl mx-auto">
          AI가 우리 브랜드를 1순위로 추천하도록,<br />
          TVC 나레이션·자막과 2차 유통물(보도자료·블로그·유튜브)의<br />
          <strong>필수 사실 문장을 역설계</strong>하는 도구입니다.
        </p>
      </div>

      <div className="card p-8 border ghost-border shadow-ambient">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
              광고주 / 브랜드명 · 제품명 (Client)
            </label>
            <input
              type="text"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="예: 휴그린, 삼성전자 비스포크, 현대자동차 캐스퍼…"
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
              placeholder="예: 자동환기창 Pro, AI 에너지 절감, 무선 충전 시스템…"
              className="w-full h-28 bg-[var(--surface-low)] border-none rounded-xl p-4 text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none transition-all"
            />
            <p className="text-xs text-gray-400 mt-2">
              TVC에서 가장 강조해야 할 제품/서비스의 핵심 특징을 입력하세요.
              이 USP가 AI의 학습 데이터에서 브랜드를 특정하는 핵심 키워드가 됩니다.
            </p>
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
            CEO 질문 역설계 시작
          </button>
        </div>
      </div>

      {/* 이 도구의 핵심 컨셉 안내 */}
      <div className="text-center text-xs text-gray-400 space-y-1 pt-4">
        <p>Creative Engine Optimization — 과거의 광고가 사람의 기억을 해킹했다면,</p>
        <p>이 도구는 <strong>AI의 근거 데이터</strong>를 선점하여 브랜드 추천 1순위를 확보합니다.</p>
      </div>
    </div>
  );
}
