'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOriginStore } from '@/store/useOriginStore';
import { Play, CheckCircle2, XCircle, AlertCircle, BarChart3, Info, ArrowRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ValidationPage() {
  const router = useRouter();
  const { clientName, usp, facts, naScript: savedNa, subScript: savedSub, setScripts } = useOriginStore();
  
  const [naScript, setNaScript] = useState(savedNa || '');
  const [subScript, setSubScript] = useState(savedSub || '');
  const [duration, setDuration] = useState('30s');
  
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<{
    facts: typeof facts;
    score: number;
    recommendations: string[];
    analyzed: boolean;
  }>({
    facts: facts || [],
    score: 0,
    recommendations: [],
    analyzed: false
  });

  // Redirect if accessed directly without running extraction
  useEffect(() => {
    if (!clientName || facts.length === 0) {
      router.push('/');
    }
  }, [clientName, facts, router]);

  const handleValidate = () => {
    if (!naScript && !subScript) return;
    setIsValidating(true);
    setScripts(naScript, subScript);
    
    // Simulate LLM validation delay
    setTimeout(() => {
      const combined = (naScript + ' ' + subScript).toLowerCase();
      
      const updatedFacts = facts.map(f => {
        // Simplified mockup logic: random success but biased by length of script for demo
        const isFound = combined.length > 20 ? Math.random() > 0.3 : false;
        return { ...f, found: isFound };
      });
      
      const foundCount = updatedFacts.filter(f => f.found).length;
      const baseScore = updatedFacts.length > 0 ? Math.floor((foundCount / updatedFacts.length) * 100) : 0;
      const score = baseScore > 0 ? Math.min(baseScore + Math.floor(Math.random() * 15), 100) : 0;

      setResults({
        facts: updatedFacts,
        score,
        recommendations: [
          'NA 스크립트 전반부에 USP가 명확히 들리도록 단어를 배치하세요.',
          '시각적 자막 스크립트에 구체적인 수치(예: 99.99%)를 누락 없이 텍스트로 표기해야 AI가 수집하기 유리합니다.'
        ],
        analyzed: true
      });
      setIsValidating(false);
    }, 1500);
  };

  const handleGoToExport = () => {
    setScripts(naScript, subScript);
    router.push('/export');
  };

  if (!clientName || facts.length === 0) return null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Context */}
      <div className="bg-[var(--surface-lowest)] rounded-xl p-6 border ghost-border shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight mb-2">카피 검증 (Copy Validation)</h1>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              <span className="font-semibold text-gray-800">광고주:</span> {clientName}
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <span className="font-semibold text-gray-800">USP:</span> {usp}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
           {results.analyzed && (
             <button 
               onClick={handleGoToExport}
               className="bg-white border border-[var(--primary)] text-[var(--primary)] px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-blue-50 transition-colors shadow-sm"
             >
               검증 완료 및 패키징 이동 <ArrowRight className="w-4 h-4" />
             </button>
           )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6">
        <h2 className="text-lg font-bold text-[var(--foreground)]">스크립트 기입 및 시뮬레이션</h2>
        <div className="flex gap-4">
          <select 
            value={duration} 
            onChange={(e) => setDuration(e.target.value)}
            className="bg-[var(--surface-lowest)] border ghost-border rounded-lg px-4 py-2 text-sm outline-none"
          >
            <option value="15s">15초 TVC</option>
            <option value="30s">30초 TVC</option>
            <option value="60s">60초 TVC</option>
            <option value="digital">디지털 범퍼</option>
          </select>
          <button 
            onClick={handleValidate}
            disabled={isValidating || (!naScript && !subScript)}
            className="gradient-btn px-6 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap shadow-sm hover:shadow-ambient"
          >
            {isValidating ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Play className="w-4 h-4 text-white" />
            )}
            시뮬레이션 실행하기
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Region */}
        <div className="space-y-6">
          <div className="bg-[var(--surface-lowest)] rounded-xl border ghost-border p-6 shadow-sm">
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">NA 스크립트 (Narration)</label>
            <textarea 
              value={naScript}
              onChange={(e) => setNaScript(e.target.value)}
              placeholder="여기에 나레이션 카피를 입력하세요 (예: 새로운 관점의 시작...)"
              className="w-full h-40 bg-[var(--surface-low)] border-none rounded-lg p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none"
            />
          </div>
          
          <div className="bg-[var(--surface-lowest)] rounded-xl border ghost-border p-6 shadow-sm">
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">자막 스크립트 (Subtitle)</label>
            <textarea 
              value={subScript}
              onChange={(e) => setSubScript(e.target.value)}
              placeholder="여기에 시각적으로 노출될 자막(On-screen Text)을 입력하세요..."
              className="w-full h-40 bg-[var(--surface-low)] border-none rounded-lg p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none"
            />
          </div>
        </div>

        {/* Results Region */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {/* KPI 1: Fact Coverage */}
            <div className="bg-[var(--surface-lowest)] rounded-xl border ghost-border p-6 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)] mb-4">
                <CheckCircle2 className="w-4 h-4 text-[var(--primary)]" />
                팩트 매칭률 (Coverage)
              </div>
              <div className="flex-1 flex flex-col justify-center items-center">
                {results.analyzed ? (
                  <div className="text-4xl font-bold tracking-tight text-[var(--foreground)]">
                    {results.facts.filter(f => f.found).length}
                    <span className="text-xl text-gray-400">/{results.facts.length}</span>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">결과 대기 중...</span>
                )}
              </div>
            </div>

            {/* KPI 2: AI Score */}
            <div className="bg-[var(--surface-lowest)] rounded-xl border ghost-border p-6 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)] mb-4">
                <BarChart3 className="w-4 h-4 text-[var(--primary)]" />
                AI 연상 시뮬레이션 점수
              </div>
              <div className="flex-1 flex flex-col justify-center items-center">
                {results.analyzed ? (
                  <div className={cn(
                    "text-5xl font-bold tracking-tight",
                    results.score >= 80 ? "text-green-600" : results.score >= 50 ? "text-amber-500" : "text-red-500"
                  )}>
                    {results.score}
                    <span className="text-xl text-gray-400">/100</span>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">결과 대기 중...</span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[var(--surface-lowest)] rounded-xl border ghost-border p-6 shadow-sm min-h-[200px]">
             <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
               필수 타겟 팩트 (Target Fact Checklist)
             </h3>
             <ul className="space-y-3">
               {results.facts.map((fact, i) => (
                 <li key={i} className="flex items-start gap-3 text-sm">
                   <div className="mt-0.5">
                     {results.analyzed ? (
                       fact.found ? (
                         <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                       ) : (
                         <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                       )
                     ) : (
                       <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />
                     )}
                   </div>
                   <span className={cn(
                     "leading-relaxed",
                     results.analyzed && !fact.found ? "text-gray-400 line-through" : "text-[var(--foreground)]"
                   )}>
                     {fact.text}
                   </span>
                 </li>
               ))}
             </ul>
          </div>

          {results.analyzed && results.recommendations.length > 0 && (
            <div className="bg-[#fdfbf7] p-5 rounded-xl border border-orange-200/50 shadow-sm text-sm">
              <div className="flex font-semibold text-[#833600] items-center gap-2 mb-3">
                 <AlertCircle className="w-4 h-4" />
                 AI 모델 최적화 제안 (Optimization Suggestions)
              </div>
              <ul className="list-disc pl-5 space-y-2 text-[#833600]/80">
                {results.recommendations.map((r, idx) => (
                  <li key={idx} className="leading-relaxed">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
