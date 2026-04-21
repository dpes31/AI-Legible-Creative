'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOriginStore } from '@/store/useOriginStore';
import { CheckCircle2, XCircle, AlertCircle, BarChart3, ArrowRight } from 'lucide-react';
import { PromptCopyCard } from '@/components/PromptCopyCard';
import { generatePhase56ValidationPrompt } from '@/lib/prompts/phase56_validation';

export default function ValidationPage() {
  const router = useRouter();
  const { clientName, usp, phase4Facts, setScripts, setCurrentPhase, addCopyIteration } = useOriginStore();
  const savedNa = useOriginStore((s) => s.naScript);
  const savedSub = useOriginStore((s) => s.subScript);

  const [naScript, setNaLocal] = useState(savedNa || '');
  const [subScript, setSubLocal] = useState(savedSub || '');
  const [duration, setDuration] = useState('30s');

  // AI 검증 결과 붙여넣기
  const [aiResponse, setAiResponse] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  // 검증 결과
  const [results, setResults] = useState<{
    factCoverage: { factId: number; status: 'included' | 'missing' | 'partial'; foundText?: string }[];
    simulationScore: { brandSpecificity: number; techCredibility: number; categoryDominance: number; total: number };
    corrections: string[];
    analyzed: boolean;
  }>({ factCoverage: [], simulationScore: { brandSpecificity: 0, techCredibility: 0, categoryDominance: 0, total: 0 }, corrections: [], analyzed: false });

  useEffect(() => {
    if (phase4Facts.length === 0) {
      router.push('/phase4');
    }
  }, [phase4Facts, router]);

  // AI 검증 결과 파싱
  const handleParseValidation = () => {
    setParseError(null);
    try {
      let jsonStr = aiResponse;
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      const braceStart = jsonStr.indexOf('{');
      if (braceStart >= 0) {
        const braceEnd = jsonStr.lastIndexOf('}');
        jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = JSON.parse(jsonStr) as any;

      setResults({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        factCoverage: (parsed.fact_coverage || []).map((fc: any) => ({
          factId: fc.fact_id,
          status: fc.status,
          foundText: fc.found_text || fc.suggestion || '',
        })),
        simulationScore: {
          brandSpecificity: parsed.simulation_score?.brand_specificity || 0,
          techCredibility: parsed.simulation_score?.tech_credibility || 0,
          categoryDominance: parsed.simulation_score?.category_dominance || 0,
          total: parsed.simulation_score?.total || 0,
        },
        corrections: parsed.corrections || [],
        analyzed: true,
      });
    } catch {
      setParseError('JSON 파싱 실패. AI의 검증 결과 JSON을 다시 확인해 주세요.');
    }
  };

  // 최종 승인
  const handleApprove = () => {
    setScripts(naScript, subScript);
    addCopyIteration({
      version: 1,
      naScript,
      subScript,
      factCoverage: results.factCoverage,
      simulationScore: results.simulationScore.total,
      corrections: results.corrections,
      approved: true,
      createdAt: new Date().toISOString(),
    });
    setCurrentPhase(6);
    router.push('/export');
  };

  const factTexts = phase4Facts.map((f) => f.fact);
  const coveredCount = results.factCoverage.filter((fc) => fc.status === 'included').length;

  if (phase4Facts.length === 0) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="bg-[var(--surface-lowest)] rounded-xl p-6 border ghost-border shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight mb-2">Phase 6: 카피 검증 루프</h1>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span><strong>광고주:</strong> {clientName}</span>
          <span><strong>USP:</strong> {usp}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌측: 카피 입력 */}
        <div className="space-y-4">
          <div className="card border ghost-border p-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-[var(--foreground)]">NA 스크립트 (나레이션)</label>
              <select value={duration} onChange={(e) => setDuration(e.target.value)}
                className="bg-[var(--surface-low)] rounded-lg px-3 py-1.5 text-xs border-none"
              >
                <option value="15s">15초</option>
                <option value="30s">30초</option>
                <option value="60s">60초</option>
              </select>
            </div>
            <textarea
              value={naScript}
              onChange={(e) => setNaLocal(e.target.value)}
              placeholder="나레이션 카피를 입력하세요..."
              className="w-full h-40 bg-[var(--surface-low)] border-none rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none"
            />
          </div>

          <div className="card border ghost-border p-6">
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-3">자막 스크립트</label>
            <textarea
              value={subScript}
              onChange={(e) => setSubLocal(e.target.value)}
              placeholder="화면에 표시될 자막 텍스트를 입력하세요..."
              className="w-full h-40 bg-[var(--surface-low)] border-none rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none"
            />
          </div>

          {/* 검증 프롬프트 */}
          <PromptCopyCard
            aiTypes={['gemini', 'claude', 'gpt']}
            getPrompt={(ai) => generatePhase56ValidationPrompt(clientName, naScript, subScript, factTexts, ai)}
            briefingTitle="검증 방법"
            briefing="위에 작성한 NA/자막을 AI에게 검증 요청합니다. 프롬프트를 복사해서 AI에 붙여넣으면, 필수 사실 포함 여부 + 점수 + 교정 권고가 JSON으로 돌아옵니다."
          />

          {/* 검증 결과 붙이기 */}
          <div className="card border ghost-border p-4">
            <h3 className="text-xs font-bold text-gray-500 mb-2">📋 AI 검증 결과 붙여넣기</h3>
            <textarea
              value={aiResponse}
              onChange={(e) => setAiResponse(e.target.value)}
              placeholder="AI의 검증 결과 JSON을 여기에..."
              className="w-full h-24 bg-[var(--surface-low)] border-none rounded-lg p-3 text-xs font-mono focus:outline-none resize-none"
            />
            {parseError && <p className="text-red-500 text-xs mt-1">{parseError}</p>}
            <button
              onClick={handleParseValidation}
              disabled={!aiResponse.trim()}
              className="mt-2 px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40"
            >
              검증 결과 분석
            </button>
          </div>
        </div>

        {/* 우측: 결과 */}
        <div className="space-y-4">
          {/* 점수 카드 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card border ghost-border p-5 text-center">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 justify-center mb-2">
                <CheckCircle2 className="w-3 h-3" /> 팩트 커버리지
              </div>
              <div className="text-3xl font-bold">
                {results.analyzed ? `${coveredCount}/${phase4Facts.length}` : '—'}
              </div>
            </div>
            <div className="card border ghost-border p-5 text-center">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 justify-center mb-2">
                <BarChart3 className="w-3 h-3" /> 시뮬레이션 점수
              </div>
              <div className={`text-3xl font-bold ${
                results.simulationScore.total >= 80 ? 'text-green-600' : 
                results.simulationScore.total >= 50 ? 'text-amber-500' : 
                results.analyzed ? 'text-red-500' : ''
              }`}>
                {results.analyzed ? `${results.simulationScore.total}` : '—'}
                {results.analyzed && <span className="text-sm text-gray-400">/100</span>}
              </div>
            </div>
          </div>

          {/* 팩트 체크리스트 */}
          <div className="card border ghost-border p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">필수 사실 커버리지</h3>
            <ul className="space-y-2">
              {phase4Facts.map((fact) => {
                const fc = results.factCoverage.find((c) => c.factId === fact.id);
                return (
                  <li key={fact.id} className="flex items-start gap-2 text-sm">
                    {results.analyzed ? (
                      fc?.status === 'included' ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        : fc?.status === 'partial' ? <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0 mt-0.5" />
                    )}
                    <span className={fc?.status === 'missing' ? 'text-gray-400 line-through' : ''}>
                      {fact.fact}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 교정 권고 */}
          {results.analyzed && results.corrections.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4" /> 교정 권고
              </h3>
              <ul className="list-disc pl-5 space-y-2 text-sm text-amber-700">
                {results.corrections.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          {/* 최종 승인 */}
          {results.analyzed && (
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                className="flex-1 gradient-btn py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90"
              >
                최종 승인 — Phase 7: 유통물 패키지로
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setResults({ ...results, analyzed: false }); setAiResponse(''); }}
                className="px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                수정하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
