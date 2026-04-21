'use client';
import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

// AI 아이콘/색상 매핑 — 각 AI의 브랜드 정체성을 시각적으로 즉시 구분
const AI_CONFIG = {
  gemini: { label: 'Gemini', color: '#4285F4', icon: '✦' },
  claude: { label: 'Claude', color: '#D97706', icon: '◈' },
  gpt: { label: 'ChatGPT', color: '#10A37F', icon: '◉' },
  perplexity: { label: 'Perplexity', color: '#7C3AED', icon: '◆' },
} as const;

type AIType = keyof typeof AI_CONFIG;

interface PromptCopyCardProps {
  /** 어떤 AI들의 프롬프트를 보여줄지 */
  aiTypes: AIType[];
  /** AI별 프롬프트 내용을 반환하는 함수 — 호출처 편의를 위해 string 타입 */
  getPrompt: (ai: string) => string;
  /** 카드 상단 브리핑 텍스트 */
  briefing: string;
  /** 브리핑 제목 */
  briefingTitle?: string;
}

/**
 * PromptCopyCard: 수동 매뉴얼 워크플로우의 핵심 UI
 * 
 * brand-consulting 앱의 "복사용 AI 프롬프트 가져오기" 패턴을 참고하되,
 * AI별로 개별 복사 버튼을 제공하여 각 AI에 최적화된 프롬프트를 쉽게 복사.
 */
export function PromptCopyCard({ aiTypes, getPrompt, briefing, briefingTitle }: PromptCopyCardProps) {
  const [copiedAI, setCopiedAI] = useState<string | null>(null);
  const [expandedAI, setExpandedAI] = useState<string | null>(null);

  const handleCopy = async (ai: AIType) => {
    try {
      const prompt = getPrompt(ai);
      await navigator.clipboard.writeText(prompt);
      setCopiedAI(ai);
      setTimeout(() => setCopiedAI(null), 2000);
    } catch {
      // 클립보드 API 실패 시 textarea fallback
      const prompt = getPrompt(ai);
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedAI(ai);
      setTimeout(() => setCopiedAI(null), 2000);
    }
  };

  return (
    <div className="card border ghost-border shadow-ambient overflow-hidden">
      {/* 시니어 플래너 브리핑 영역 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
        <h3 className="text-sm font-bold text-blue-900 mb-1 flex items-center gap-2">
          💡 {briefingTitle || '시니어 플래너의 브리핑'}
        </h3>
        <p className="text-sm text-blue-800 leading-relaxed">{briefing}</p>
      </div>

      {/* AI별 프롬프트 복사 버튼 */}
      <div className="p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          아래 AI 중 하나를 선택하여 프롬프트를 복사하세요
        </p>

        {aiTypes.map((ai) => {
          const config = AI_CONFIG[ai];
          const isCopied = copiedAI === ai;
          const isExpanded = expandedAI === ai;

          return (
            <div key={ai} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-white">
                {/* AI 아이콘 */}
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: config.color }}
                >
                  {config.icon}
                </span>

                {/* AI 이름 */}
                <span className="font-medium text-sm flex-1">{config.label}</span>

                {/* 미리보기 토글 */}
                <button
                  onClick={() => setExpandedAI(isExpanded ? null : ai)}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1 rounded transition-colors"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  미리보기
                </button>

                {/* 복사 버튼 */}
                <button
                  onClick={() => handleCopy(ai)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isCopied
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {isCopied ? (
                    <>
                      <Check className="w-4 h-4" /> 복사 완료!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> 프롬프트 복사
                    </>
                  )}
                </button>
              </div>

              {/* 프롬프트 미리보기 (토글) */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 p-4">
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                    {getPrompt(ai)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
