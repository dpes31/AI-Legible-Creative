'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, Copy, Check } from 'lucide-react';
import { useOriginStore, MeasurementResult } from '@/store/useOriginStore';
import { getPhase3Guide } from '@/lib/prompts/phase3_measurement';

const AI_PLATFORMS = ['gemini', 'gpt', 'claude', 'perplexity'] as const;
type AIPlatform = (typeof AI_PLATFORMS)[number];

// AI별 브랜드 색상
const AI_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  gemini: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Gemini' },
  gpt: { bg: 'bg-green-100', text: 'text-green-700', label: 'ChatGPT' },
  claude: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Claude' },
  perplexity: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Perplexity' },
};

/** 언급 상태 토글링: null → true → false → null (3-state) */
function nextMentionState(current: boolean | null): boolean | null {
  if (current === null) return true;    // 미측정 → 언급됨
  if (current === true) return false;   // 언급됨 → 미언급
  return null;                          // 미언급 → 미측정(리셋)
}

export default function Phase3Page() {
  const router = useRouter();
  const { clientName, phase2Questions, setPhase3Measurements, setCurrentPhase } = useOriginStore();

  // 초기 측정 데이터: 모든 질문 × 모든 AI = null(미측정)
  const [measurements, setMeasurements] = useState<MeasurementResult[]>(() =>
    phase2Questions.map((q) => ({
      questionId: q.id,
      gemini: null,
      gpt: null,
      claude: null,
      perplexity: null,
    }))
  );

  // 복사 상태
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Phase 2 미완료 시 리다이렉트
  useEffect(() => {
    if (phase2Questions.length === 0) {
      router.push('/phase2');
    }
  }, [phase2Questions, router]);

  // 질문 복사 (개별 AI에 던지기)
  const handleCopyQuestion = async (question: string, aiKey: string) => {
    try {
      await navigator.clipboard.writeText(question);
      setCopiedKey(aiKey);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {/* fallback 생략 */}
  };

  // 측정 결과 토글
  const toggleMeasurement = (questionId: number, ai: AIPlatform) => {
    setMeasurements((prev) =>
      prev.map((m) =>
        m.questionId === questionId
          ? { ...m, [ai]: nextMentionState(m[ai]) }
          : m
      )
    );
  };

  // 자동 집계
  const stats = useMemo(() => {
    const total = measurements.length * AI_PLATFORMS.length;
    let mentioned = 0;
    let measured = 0;

    const perAI: Record<string, { mentioned: number; total: number }> = {};
    AI_PLATFORMS.forEach((ai) => {
      perAI[ai] = { mentioned: 0, total: 0 };
    });

    measurements.forEach((m) => {
      AI_PLATFORMS.forEach((ai) => {
        if (m[ai] !== null) {
          measured++;
          perAI[ai].total++;
          if (m[ai] === true) {
            mentioned++;
            perAI[ai].mentioned++;
          }
        }
      });
    });

    return {
      overallRate: measured > 0 ? Math.round((mentioned / measured) * 100) : 0,
      measuredCount: measured,
      totalSlots: total,
      perAI,
    };
  }, [measurements]);

  // Phase 3 완료 → Phase 4
  const handleConfirm = () => {
    setPhase3Measurements(measurements);
    setCurrentPhase(3);
    router.push('/phase4');
  };

  if (phase2Questions.length === 0) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <BarChart3 className="w-4 h-4" />
          Phase 3
        </div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">
          Before 측정
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Phase 2의 질문을 4대 AI에 직접 던져 {clientName} 언급 여부를 확인합니다.
        </p>
      </div>

      {/* 가이드 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 rounded-xl border border-blue-100">
        <h3 className="text-sm font-bold text-blue-900 mb-2">💡 측정 방법</h3>
        <pre className="text-xs text-blue-800 whitespace-pre-wrap leading-relaxed">
          {getPhase3Guide(clientName)}
        </pre>
      </div>

      {/* 통계 요약 */}
      <div className="grid grid-cols-5 gap-3">
        <div className="card border ghost-border p-4 text-center">
          <div className="text-2xl font-bold text-[var(--foreground)]">{stats.overallRate}%</div>
          <div className="text-xs text-gray-500">전체 언급률</div>
        </div>
        {AI_PLATFORMS.map((ai) => {
          const aiStats = stats.perAI[ai];
          const rate = aiStats.total > 0 ? Math.round((aiStats.mentioned / aiStats.total) * 100) : 0;
          return (
            <div key={ai} className="card border ghost-border p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: rate > 50 ? '#10B981' : rate > 0 ? '#F59E0B' : '#6B7280' }}>
                {rate}%
              </div>
              <div className="text-xs text-gray-500">{AI_COLORS[ai].label}</div>
            </div>
          );
        })}
      </div>

      {/* 체크리스트 테이블 */}
      <div className="card border ghost-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-8">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">질문</th>
                {AI_PLATFORMS.map((ai) => (
                  <th key={ai} className="text-center px-2 py-3 text-xs font-semibold text-gray-500 w-24">
                    {AI_COLORS[ai].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {phase2Questions.map((q) => {
                const m = measurements.find((m) => m.questionId === q.id);
                return (
                  <tr key={q.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-400 text-xs">{q.id}</td>
                    <td className="px-4 py-3 text-gray-800">{q.question}</td>
                    {AI_PLATFORMS.map((ai) => {
                      const val = m?.[ai] ?? null;
                      const copyKey = `${q.id}-${ai}`;
                      return (
                        <td key={ai} className="text-center px-2 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {/* 복사 버튼 */}
                            <button
                              onClick={() => handleCopyQuestion(q.question, copyKey)}
                              className="p-1 text-gray-300 hover:text-gray-600 rounded transition-colors"
                              title={`${AI_COLORS[ai].label}에 복사`}
                            >
                              {copiedKey === copyKey ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            {/* 언급 여부 토글 */}
                            <button
                              onClick={() => toggleMeasurement(q.id, ai)}
                              className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                                val === true
                                  ? 'bg-green-100 text-green-700 ring-2 ring-green-300'
                                  : val === false
                                  ? 'bg-red-100 text-red-600 ring-2 ring-red-300'
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                              }`}
                            >
                              {val === true ? '✅' : val === false ? '❌' : '—'}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 진행 정보 + 확인 버튼 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          측정 완료: {stats.measuredCount} / {stats.totalSlots}
        </p>
        <button
          onClick={handleConfirm}
          className="gradient-btn px-6 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          측정 완료 — Phase 4: 사실 문장 추출로
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
