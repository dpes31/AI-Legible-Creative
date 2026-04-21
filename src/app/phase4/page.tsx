'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileCheck, Trash2, Plus, GripVertical } from 'lucide-react';
import { useOriginStore, CoreFact } from '@/store/useOriginStore';
import { PromptCopyCard } from '@/components/PromptCopyCard';
import { generatePhase4Prompt } from '@/lib/prompts/phase4_facts';

// 신뢰도별 색상
const CONFIDENCE_COLORS: Record<string, string> = {
  '상': 'bg-green-100 text-green-700 ring-green-300',
  '중': 'bg-amber-100 text-amber-700 ring-amber-300',
  '하': 'bg-red-100 text-red-600 ring-red-300',
};

export default function Phase4Page() {
  const router = useRouter();
  const { clientName, usp, phase2Questions, phase3Measurements, setPhase4Facts, setCurrentPhase } = useOriginStore();
  const storedFacts = useOriginStore((s) => s.phase4Facts);

  const [aiResponse, setAiResponse] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [facts, setFacts] = useState<CoreFact[]>(storedFacts.length > 0 ? storedFacts : []);

  // Phase 3 미완료 시 리다이렉트
  useEffect(() => {
    if (phase2Questions.length === 0) {
      router.push('/phase2');
    }
  }, [phase2Questions, router]);

  // 질문 텍스트 목록 (프롬프트용)
  const questionTexts = phase2Questions.map((q) => q.question);

  // AI 응답 파싱
  const handleParseResponse = () => {
    setParseError(null);
    try {
      let jsonStr = aiResponse;
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];

      const bracketStart = jsonStr.indexOf('[');
      if (bracketStart >= 0) {
        const bracketEnd = jsonStr.lastIndexOf(']');
        jsonStr = jsonStr.slice(bracketStart, bracketEnd + 1);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = JSON.parse(jsonStr) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newFacts: CoreFact[] = parsed.map((f: any, i: number) => ({
        id: i + 1,
        fact: String(f.fact || f.text || ''),
        sourceUrl: String(f.source_url || f.sourceUrl || ''),
        confidence: (f.confidence === '상' || f.confidence === '중' || f.confidence === '하'
          ? f.confidence
          : f.confidence >= 0.8 ? '상' : f.confidence >= 0.5 ? '중' : '하') as CoreFact['confidence'],
        coversQuestions: (f.covers_questions || f.coversQuestions || []) as number[],
      }));

      if (newFacts.length === 0) throw new Error('사실 문장이 파싱되지 않았습니다.');
      setFacts(newFacts);
    } catch {
      setParseError('JSON 파싱 실패. AI 응답의 JSON 배열만 복사해서 붙여넣어 주세요.');
    }
  };

  // 사실 문장 삭제
  const handleDelete = (id: number) => {
    setFacts((prev) => prev.filter((f) => f.id !== id));
  };

  // 수동 추가 상태
  const [newFact, setNewFact] = useState('');
  const [newConfidence, setNewConfidence] = useState<CoreFact['confidence']>('중');

  const handleAdd = () => {
    if (!newFact.trim()) return;
    const maxId = facts.reduce((max, f) => Math.max(max, f.id), 0);
    setFacts((prev) => [
      ...prev,
      { id: maxId + 1, fact: newFact, confidence: newConfidence, coversQuestions: [] },
    ]);
    setNewFact('');
  };

  // Phase 4 완료 → Phase 5
  const handleConfirm = () => {
    if (facts.length === 0) return;
    setPhase4Facts(facts);
    setCurrentPhase(4);
    router.push('/phase5');
  };

  // 취약 질문 계산 (Phase 3에서 언급률 0%인 질문)
  const criticalGapQuestions = phase2Questions.filter((q) => {
    const m = phase3Measurements.find((m) => m.questionId === q.id);
    if (!m) return true;
    return !m.gemini && !m.gpt && !m.claude && !m.perplexity;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <FileCheck className="w-4 h-4" />
          Phase 4
        </div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">
          사실 문장 추출
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          AI가 {clientName}을(를) 1순위로 답하려면 세상에 존재해야 할 <strong>검증 가능한 사실 문장</strong>을 추출합니다.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          이 사실 문장이 TVC 자막/나레이션의 <strong>수정 불가 영역</strong>이 됩니다.
        </p>
      </div>

      {/* 취약 질문 표시 (Phase 3 결과 기반) */}
      {criticalGapQuestions.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-red-800 mb-2">
            ⚠️ 4대 AI 모두에서 미언급된 취약 질문 ({criticalGapQuestions.length}개)
          </h3>
          <p className="text-xs text-red-600 mb-3">
            아래 질문에 대해 AI가 우리 브랜드를 답하지 못했습니다. 이 질문들을 커버하는 사실 문장이 가장 시급합니다.
          </p>
          <div className="space-y-1">
            {criticalGapQuestions.map((q) => (
              <div key={q.id} className="text-sm text-red-700 flex items-center gap-2">
                <span className="text-red-400 text-xs">Q{q.id}</span>
                {q.question}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 프롬프트 복사 카드 */}
      <PromptCopyCard
        aiTypes={['gemini', 'claude', 'gpt']}
        getPrompt={(ai) => generatePhase4Prompt(clientName, usp, questionTexts, ai)}
        briefingTitle="사실 문장이 왜 중요한가"
        briefing={`AI는 웹상에 존재하는 구체적 사실을 근거로 브랜드를 추천합니다. "동(Cu) 코팅 헤파필터로 바이러스 99.95% 박멸" 같은 수치·기술명이 포함된 문장이 TVC 자막에 들어가고, 보도자료에 유통되면 AI가 이를 학습합니다.`}
      />

      {/* AI 응답 붙여넣기 */}
      <div className="card border ghost-border p-6">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-3">📋 AI 응답 붙여넣기</h3>
        <textarea
          value={aiResponse}
          onChange={(e) => setAiResponse(e.target.value)}
          placeholder='AI에서 받은 사실 문장 JSON을 여기에 붙여넣으세요...'
          className="w-full h-40 bg-[var(--surface-low)] border-none rounded-xl p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none transition-all"
        />
        {parseError && <p className="text-red-500 text-xs mt-2">{parseError}</p>}
        <button
          onClick={handleParseResponse}
          disabled={!aiResponse.trim()}
          className="mt-3 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          사실 문장 분석
        </button>
      </div>

      {/* 사실 문장 리스트 */}
      {facts.length > 0 && (
        <div className="card border ghost-border p-6">
          <h3 className="text-sm font-bold text-[var(--foreground)] mb-4">
            🔒 확정된 사실 문장 ({facts.length}개)
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            {`아래 문장이 TVC 나레이션/자막의 "수정 불가 영역"으로 고정됩니다.`}
          </p>

          <div className="space-y-3">
            {facts.map((f) => (
              <div key={f.id} className="flex items-start gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200 group">
                <GripVertical className="w-4 h-4 text-gray-300 mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ring-1 ${CONFIDENCE_COLORS[f.confidence]}`}>
                      신뢰도: {f.confidence}
                    </span>
                    {f.coversQuestions.length > 0 && (
                      <span className="text-xs text-gray-400">
                        커버 질문: {f.coversQuestions.map((id) => `Q${id}`).join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 font-medium leading-relaxed">
                    🔒 {f.fact}
                  </p>
                  {f.sourceUrl && (
                    <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 block">
                      출처: {f.sourceUrl}
                    </a>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(f.id)}
                  className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 수동 추가 */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
            <select
              value={newConfidence}
              onChange={(e) => setNewConfidence(e.target.value as CoreFact['confidence'])}
              className="bg-[var(--surface-low)] rounded-lg px-3 py-2 text-xs"
            >
              <option value="상">신뢰도: 상</option>
              <option value="중">신뢰도: 중</option>
              <option value="하">신뢰도: 하</option>
            </select>
            <input
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="사실 문장을 직접 추가하세요..."
              className="flex-1 bg-[var(--surface-low)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)]"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!newFact.trim()}
              className="p-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleConfirm}
            className="w-full gradient-btn py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity mt-6"
          >
            사실 문장 확정 — Phase 5: 카피 초안으로
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
