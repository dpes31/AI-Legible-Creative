'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, PenTool, Lock, Unlock, Copy, Check } from 'lucide-react';
import { useOriginStore } from '@/store/useOriginStore';
import { PromptCopyCard } from '@/components/PromptCopyCard';
import { generatePhase55Prompt } from '@/lib/prompts/phase55_draft';

export default function Phase5Page() {
  const router = useRouter();
  const { clientName, usp, phase4Facts, phase3Measurements, setCurrentPhase } = useOriginStore();

  // TVC 초안 붙여넣기
  const [aiResponse, setAiResponse] = useState('');
  const [draftText, setDraftText] = useState('');
  const [copied, setCopied] = useState(false);

  // Phase 4 미완료 시 리다이렉트
  useEffect(() => {
    if (phase4Facts.length === 0) {
      router.push('/phase4');
    }
  }, [phase4Facts, router]);

  // Before 측정 요약 계산
  const measurementSummary = useMemo(() => {
    const total = phase3Measurements.length * 4;
    let mentioned = 0;
    phase3Measurements.forEach((m) => {
      if (m.gemini === true) mentioned++;
      if (m.gpt === true) mentioned++;
      if (m.claude === true) mentioned++;
      if (m.perplexity === true) mentioned++;
    });
    return {
      rate: total > 0 ? Math.round((mentioned / total) * 100) : 0,
      mentioned,
      total,
    };
  }, [phase3Measurements]);

  // 사실 문장 텍스트 목록
  const factTexts = phase4Facts.map((f) => f.fact);

  // TVC 초안 처리
  const handleApplyDraft = () => {
    setDraftText(aiResponse);
  };

  // 전체 복사
  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {/* */}
  };

  // Phase 5 완료 → Phase 6(카피 검증)
  const handleConfirm = () => {
    setCurrentPhase(5);
    router.push('/validation');
  };

  if (phase4Facts.length === 0) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <PenTool className="w-4 h-4" />
          Phase 5
        </div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">
          카피 가이드 + TVC 초안
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Phase 3 분석 결과와 Phase 4 사실 문장을 결합하여 <strong>TVC 나레이션·자막 초안</strong>을 생성합니다.
        </p>
      </div>

      {/* 현재 분석 요약 (Phase 3 + 4) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Before 측정 요약 */}
        <div className="card border ghost-border p-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">📊 현재 AI 언급 현황 (Phase 3)</h3>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold" style={{ color: measurementSummary.rate > 50 ? '#10B981' : '#EF4444' }}>
              {measurementSummary.rate}%
            </div>
            <div className="text-sm text-gray-600">
              <p>전체 언급률</p>
              <p className="text-xs text-gray-400">
                {measurementSummary.mentioned} / {measurementSummary.total} 슬롯에서 언급
              </p>
            </div>
          </div>
        </div>

        {/* 핵심 사실 요약 */}
        <div className="card border ghost-border p-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">🔒 심어야 할 핵심 사실 (Phase 4)</h3>
          <div className="space-y-1.5">
            {phase4Facts.slice(0, 4).map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-xs">
                <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="text-gray-700 truncate">{f.fact}</span>
              </div>
            ))}
            {phase4Facts.length > 4 && (
              <p className="text-xs text-gray-400 ml-5">+{phase4Facts.length - 4}개 더</p>
            )}
          </div>
        </div>
      </div>

      {/* TVC 초안 프롬프트 복사 */}
      <PromptCopyCard
        aiTypes={['gemini', 'claude', 'gpt']}
        getPrompt={(ai) => generatePhase55Prompt(clientName, usp, factTexts, ai)}
        briefingTitle="TVC 초안의 핵심 원칙"
        briefing={`AI가 학습할 사실 문장은 "수정 불가 영역"으로 고정됩니다. 카피라이터는 감성 카피·연출 부분만 자유롭게 수정할 수 있습니다. 이렇게 하면 어떤 크리에이터가 작업하더라도 AI 학습에 필수적인 팩트는 보존됩니다.`}
      />

      {/* AI 응답 붙여넣기 */}
      <div className="card border ghost-border p-6">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">📋 AI가 생성한 TVC 초안 붙여넣기</h3>
        <textarea
          value={aiResponse}
          onChange={(e) => setAiResponse(e.target.value)}
          placeholder="AI에서 받은 TVC 초안을 여기에 붙여넣으세요...&#10;&#10;예:&#10;[시안 A: 신뢰형]&#10;(NA 1~5초) &quot;요즘 미세먼지, 창문 열 수도 닫을 수도 없죠.&quot;&#10;  └ 수정 가능 (감성 후킹)&#10;..."
          className="w-full h-48 bg-[var(--surface-low)] border-none rounded-xl p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none transition-all"
        />
        <button
          onClick={handleApplyDraft}
          disabled={!aiResponse.trim()}
          className="mt-3 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          초안 적용
        </button>
      </div>

      {/* TVC 초안 렌더링 */}
      {draftText && (
        <div className="card border ghost-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--foreground)]">📝 TVC 초안 미리보기</h3>
            <button
              onClick={handleCopyAll}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? '복사 완료' : '전체 복사'}
            </button>
          </div>

          {/* TVC 텍스트를 수정불가/가능 영역으로 하이라이팅 */}
          <div className="bg-gray-50 rounded-xl p-6 space-y-2">
            {draftText.split('\n').map((line, i) => {
              const isLocked = line.includes('수정 불가') || line.includes('🔒');
              const isEditable = line.includes('수정 가능') || line.includes('✏️');
              const isFactLine = factTexts.some((fact) => line.includes(fact));

              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-sm leading-relaxed px-3 py-1.5 rounded ${
                    isLocked || isFactLine
                      ? 'bg-gray-200 border-l-4 border-gray-500 text-gray-800'
                      : isEditable
                      ? 'bg-blue-50 border-l-4 border-blue-300 text-blue-900'
                      : 'text-gray-700'
                  }`}
                >
                  {(isLocked || isFactLine) && <Lock className="w-3 h-3 text-gray-500 mt-1 shrink-0" />}
                  {isEditable && <Unlock className="w-3 h-3 text-blue-400 mt-1 shrink-0" />}
                  <span className="font-mono text-xs whitespace-pre-wrap">{line}</span>
                </div>
              );
            })}
          </div>

          {/* 팩트 커버리지 체크 */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-amber-800 mb-2">필수 사실 커버리지</h4>
            <div className="space-y-1">
              {phase4Facts.map((f) => {
                const included = draftText.includes(f.fact) || draftText.toLowerCase().includes(f.fact.toLowerCase());
                return (
                  <div key={f.id} className="flex items-center gap-2 text-xs">
                    <span>{included ? '✓' : '✗'}</span>
                    <span className={included ? 'text-green-700' : 'text-red-600'}>{f.fact}</span>
                    {!included && <span className="text-red-400">(미포함 → 블로그/보도자료에서 보완)</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleConfirm}
              className="flex-1 gradient-btn py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              초안 확인 — Phase 6: 카피 검증으로
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setDraftText(''); setAiResponse(''); }}
              className="px-4 py-3 rounded-xl text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              다시 작성
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
