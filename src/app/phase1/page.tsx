'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Layers, Search, Loader2 } from 'lucide-react';
import { useOriginStore, Phase1Context } from '@/store/useOriginStore';
import { PromptCopyCard } from '@/components/PromptCopyCard';
import { generatePhase1Prompt } from '@/lib/prompts/phase1_category';

// 네이버 연관검색어 타입 (보조 참고 패널용)
interface NaverKeyword {
  keyword: string;
  totalVol: number;
  pcVol: number;
  mobileVol: number;
}

export default function Phase1Page() {
  const router = useRouter();
  const { clientName, usp, setPhase1 } = useOriginStore();


  // AI 응답 붙여넣기 영역
  const [aiResponse, setAiResponse] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedContext, setParsedContext] = useState<Phase1Context | null>(null);

  // 네이버 보조 데이터
  const [naverKeywords, setNaverKeywords] = useState<NaverKeyword[]>([]);
  const [naverLoading, setNaverLoading] = useState(false);

  // 입력값 없으면 홈으로 리다이렉트
  useEffect(() => {
    if (!clientName) {
      router.push('/');
    }
  }, [clientName, router]);

  // 네이버 연관검색어 자동 수집 (보조 참고용)
  useEffect(() => {
    if (!clientName) return;
    setNaverLoading(true);

    const sanitized = clientName.trim().replace(/\s+/g, ',');
    fetch(`https://naver-mindmap.vercel.app/api/keywords?keyword=${encodeURIComponent(sanitized)}`)
      .then((res) => res.json())
      .then((data) => {
        const keywords = (data.keywords || [])
          .sort((a: NaverKeyword, b: NaverKeyword) => b.totalVol - a.totalVol)
          .slice(0, 15);
        setNaverKeywords(keywords);
      })
      .catch(() => setNaverKeywords([]))
      .finally(() => setNaverLoading(false));
  }, [clientName]);

  // AI 응답에서 JSON 자동 파싱
  const handleParseResponse = () => {
    setParseError(null);
    try {
      // JSON 블록 추출: ```json...``` 또는 순수 JSON
      let jsonStr = aiResponse;
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];

      // { 로 시작하는 부분만 추출
      const braceStart = jsonStr.indexOf('{');
      if (braceStart >= 0) {
        const braceEnd = jsonStr.lastIndexOf('}');
        jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
      }

      const parsed = JSON.parse(jsonStr);
      const ctx: Phase1Context = {
        industry: parsed.industry || '',
        categoryKeywords: parsed.category_keywords || [],
        competitors: parsed.competitors || [],
        purchaseDecisionFactors: parsed.purchase_decision_factors || [],
        targetCustomer: parsed.target_customer || '',
        naverKeywords: naverKeywords,
      };
      setParsedContext(ctx);
    } catch {
      setParseError('JSON 파싱 실패. AI 응답에서 JSON 블록만 복사해서 붙여넣어 주세요.');
    }
  };

  // Phase 1 완료 → Phase 2로
  const handleConfirm = () => {
    if (!parsedContext) return;
    setPhase1(parsedContext);
    router.push('/phase2');
  };

  if (!clientName) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Layers className="w-4 h-4" />
          Phase 1
        </div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">
          카테고리 추론
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {`"${clientName}"의 산업·경쟁사·소비자 구매결정요인을 파악합니다.`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 프롬프트 복사 + 결과 붙이기 (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* 프롬프트 복사 카드 */}
          <PromptCopyCard
            aiTypes={['gemini', 'claude', 'gpt']}
            getPrompt={(ai) => generatePhase1Prompt(clientName, usp, ai)}
            briefingTitle="이 단계의 목적"
            briefing={`${clientName}이(가) 속한 산업의 카테고리 키워드, 경쟁 브랜드, 소비자 구매결정요인을 AI에게 물어봅니다. 아래 버튼으로 프롬프트를 복사한 후, 원하는 AI에 붙여넣기 하세요.`}
          />

          {/* AI 응답 붙여넣기 영역 */}
          <div className="card border ghost-border p-6">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
              📋 AI 응답 붙여넣기
            </h3>
            <textarea
              value={aiResponse}
              onChange={(e) => setAiResponse(e.target.value)}
              placeholder='AI에서 받은 JSON 응답을 여기에 붙여넣으세요...&#10;&#10;예:&#10;{&#10;  "industry": "창호/환기 시스템",&#10;  "category_keywords": ["자동환기창", ...],&#10;  ...&#10;}'
              className="w-full h-48 bg-[var(--surface-low)] border-none rounded-xl p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary-container)] resize-none transition-all"
            />
            {parseError && (
              <p className="text-red-500 text-xs mt-2">{parseError}</p>
            )}
            <button
              onClick={handleParseResponse}
              disabled={!aiResponse.trim()}
              className="mt-3 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              응답 분석하기
            </button>
          </div>

          {/* 파싱 결과 미리보기 + 확인 */}
          {parsedContext && (
            <div className="card border border-green-200 bg-green-50 p-6 space-y-4">
              <h3 className="text-sm font-bold text-green-800">✅ 분석 결과 확인</h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 text-xs">산업/카테고리</span>
                  <p className="font-medium">{parsedContext.industry}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">타깃 고객</span>
                  <p className="font-medium">{parsedContext.targetCustomer}</p>
                </div>
              </div>

              <div>
                <span className="text-gray-500 text-xs">카테고리 키워드</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {parsedContext.categoryKeywords.map((kw, i) => (
                    <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-gray-500 text-xs">경쟁사</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {parsedContext.competitors.map((c, i) => (
                    <span key={i} className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-gray-500 text-xs">구매결정요인</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {parsedContext.purchaseDecisionFactors.map((f, i) => (
                    <span key={i} className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={handleConfirm}
                className="w-full gradient-btn py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity mt-2"
              >
                확인 — Phase 2: 질문 역설계로 이동
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 우측: 네이버 검색 보조 패널 (1/3) */}
        <div className="space-y-4">
          <div className="card border ghost-border p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Search className="w-3 h-3" />
              참고: 네이버 연관검색어
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              소비자가 실제로 검색하는 키워드입니다.
              Phase 2 질문 역설계의 재료로 활용됩니다.
            </p>

            {naverLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : naverKeywords.length > 0 ? (
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {naverKeywords.map((kw, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-5 text-right">{i + 1}</span>
                      <span className="font-medium text-gray-700">{kw.keyword}</span>
                    </div>
                    <span className="text-blue-600 font-mono text-xs">
                      {kw.totalVol.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">데이터 없음</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
