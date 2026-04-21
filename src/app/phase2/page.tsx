'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, MessageSquare, Trash2, Plus, Edit2, Check } from 'lucide-react';
import { useOriginStore, Question } from '@/store/useOriginStore';
import { PromptCopyCard } from '@/components/PromptCopyCard';
import { generatePhase2Prompt } from '@/lib/prompts/phase2_questions';

// 의도별 색상 — MECE 원칙에 따라 시각적으로 구분
const INTENT_COLORS: Record<string, string> = {
  '추천': 'bg-blue-100 text-blue-700',
  '비교': 'bg-purple-100 text-purple-700',
  '기능': 'bg-green-100 text-green-700',
  '가격': 'bg-amber-100 text-amber-700',
  '신뢰성': 'bg-red-100 text-red-700',
};

export default function Phase2Page() {
  const router = useRouter();
  const { clientName, phase1, setPhase2Questions } = useOriginStore();
  const storedQuestions = useOriginStore((s) => s.phase2Questions);

  // AI 응답 붙여넣기
  const [aiResponse, setAiResponse] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>(storedQuestions);

  // 수동 편집
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [newIntent, setNewIntent] = useState<Question['intent']>('추천');

  // Phase 1 미완료 시 리다이렉트
  useEffect(() => {
    if (!phase1) {
      router.push('/phase1');
    }
  }, [phase1, router]);

  // AI 응답 파싱
  const handleParseResponse = () => {
    setParseError(null);
    try {
      let jsonStr = aiResponse;
      // ```json...``` 블록 추출
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];

      // [ 로 시작하는 배열 추출
      const bracketStart = jsonStr.indexOf('[');
      if (bracketStart >= 0) {
        const bracketEnd = jsonStr.lastIndexOf(']');
        jsonStr = jsonStr.slice(bracketStart, bracketEnd + 1);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = JSON.parse(jsonStr) as any[];
      const newQuestions: Question[] = parsed.map((q: any, i: number) => ({
        id: i + 1,
        question: String(q.question || q.text || ''),
        intent: (q.intent || '추천') as Question['intent'],
      }));

      if (newQuestions.length === 0) {
        throw new Error('질문이 파싱되지 않았습니다.');
      }

      setQuestions(newQuestions);
    } catch {
      setParseError('JSON 파싱 실패. AI 응답에서 JSON 배열만 복사해서 붙여넣어 주세요.');
    }
  };

  // 질문 삭제
  const handleDelete = (id: number) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  // 질문 편집 시작
  const startEdit = (q: Question) => {
    setEditingId(q.id);
    setEditText(q.question);
  };

  // 질문 편집 확정
  const confirmEdit = () => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === editingId ? { ...q, question: editText } : q))
    );
    setEditingId(null);
    setEditText('');
  };

  // 질문 수동 추가
  const handleAdd = () => {
    if (!newQuestion.trim()) return;
    const maxId = questions.reduce((max, q) => Math.max(max, q.id), 0);
    setQuestions((prev) => [
      ...prev,
      { id: maxId + 1, question: newQuestion, intent: newIntent },
    ]);
    setNewQuestion('');
  };

  // Phase 2 완료 → Phase 3으로
  const handleConfirm = () => {
    if (questions.length === 0) return;
    setPhase2Questions(questions);
    router.push('/phase3');
  };

  if (!phase1) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 text-sm text-blue-600 mb-1">
          <MessageSquare className="w-4 h-4" />
          Phase 2 — ⭐ 핵심 단계
        </div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">
          질문 역설계
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          AI가 {clientName}을(를) 1순위로 추천하게 만들 수 있는 <strong>MECE 소비자 질문 10개</strong>를 생성합니다.
        </p>
        {/* 핵심 원칙 경고 */}
        <div className="mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          ⚠️ <strong>절대 금지 원칙</strong>: 프롬프트에 {clientName} 브랜드명이 긍정 조건으로 포함되지 않습니다.
          AI가 동어반복 답변을 생성해 검증 의미가 사라지기 때문입니다.
        </div>
      </div>

      {/* 프롬프트 복사 카드 */}
      <PromptCopyCard
        aiTypes={['gemini', 'claude', 'gpt']}
        getPrompt={(ai) =>
          generatePhase2Prompt(
            phase1.categoryKeywords,
            phase1.purchaseDecisionFactors,
            phase1.competitors,
            ai
          )
        }
        briefingTitle="질문 역설계의 핵심"
        briefing={`"${phase1.industry}" 카테고리에서 소비자가 AI에게 물어볼 법한 질문을 생성합니다. 이 질문에 AI가 답했을 때 "${clientName}"이 1순위로 언급되는지 측정하는 것이 Phase 3의 목적입니다.`}
      />

      {/* AI 응답 붙여넣기 */}
      <div className="card border ghost-border p-6">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
          📋 AI 응답 붙여넣기
        </h3>
        <textarea
          value={aiResponse}
          onChange={(e) => setAiResponse(e.target.value)}
          placeholder='AI에서 받은 질문 목록 JSON을 여기에 붙여넣으세요...&#10;&#10;예:&#10;[&#10;  { "id": 1, "question": "AI로 자동 환기되는 창호 추천해줘", "intent": "추천" },&#10;  ...&#10;]'
          className="w-full h-40 bg-[var(--surface-low)] border-none rounded-xl p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none transition-all"
        />
        {parseError && <p className="text-red-500 text-xs mt-2">{parseError}</p>}
        <button
          onClick={handleParseResponse}
          disabled={!aiResponse.trim()}
          className="mt-3 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          질문 목록 분석
        </button>
      </div>

      {/* 질문 테이블 */}
      {questions.length > 0 && (
        <div className="card border ghost-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--foreground)]">
              역설계된 질문 목록 ({questions.length}개)
            </h3>
            <div className="flex gap-2 text-xs">
              {Object.entries(INTENT_COLORS).map(([intent, cls]) => (
                <span key={intent} className={`px-2 py-0.5 rounded-full ${cls}`}>{intent}</span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {questions.map((q) => (
              <div
                key={q.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-low)] hover:bg-[var(--surface-lowest)] transition-colors group"
              >
                <span className="text-gray-400 text-xs font-mono w-6 text-right shrink-0">
                  {q.id}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${INTENT_COLORS[q.intent] || 'bg-gray-100'}`}>
                  {q.intent}
                </span>

                {editingId === q.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="flex-1 bg-white border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none"
                      autoFocus
                    />
                    <button onClick={confirmEdit} className="text-green-600 hover:text-green-800">
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="flex-1 text-sm text-gray-800">{q.question}</span>
                )}

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(q)}
                    className="p-1 text-gray-400 hover:text-blue-600 rounded"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 수동 추가 */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
            <select
              value={newIntent}
              onChange={(e) => setNewIntent(e.target.value as Question['intent'])}
              className="bg-[var(--surface-low)] rounded-lg px-3 py-2 text-xs"
            >
              <option value="추천">추천</option>
              <option value="비교">비교</option>
              <option value="기능">기능</option>
              <option value="가격">가격</option>
              <option value="신뢰성">신뢰성</option>
            </select>
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="질문을 직접 추가하세요..."
              className="flex-1 bg-[var(--surface-low)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)]"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!newQuestion.trim()}
              className="p-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* 확인 버튼 */}
          <button
            onClick={handleConfirm}
            className="w-full gradient-btn py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity mt-6"
          >
            질문 확정 — Phase 3: Before 측정으로 이동
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
