'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOriginStore } from '@/store/useOriginStore';
import { Download, Lock, Package, Copy, Check } from 'lucide-react';

const TABS = ['보도자료', '블로그 포스팅', '유튜브 메타데이터', '위키피디아 문체 요약'];

export default function ExportPage() {
  const router = useRouter();
  const { clientName, usp, phase4Facts } = useOriginStore();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [editableContent, setEditableContent] = useState(
    '여기에 크리에이티브 후크, 스토리텔링 및 도입부 단락을 입력하세요. 이 섹션은 자유롭게 수정이 가능합니다.'
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!clientName) {
      router.push('/');
    }
  }, [clientName, router]);

  // 팩트 문장 목록 (수정불가 영역)
  const lockedFactString = phase4Facts.length > 0
    ? phase4Facts.map((f) => f.fact).join(' / ')
    : '이 영역은 Phase 4에서 추출된 팩트로 채워집니다. Phase 1~4를 먼저 완료하세요.';

  // 전체 복사
  const handleCopy = async () => {
    const fullText = `[${clientName} ${usp}] ${activeTab}\n\n${editableContent}\n\n[필수 사실 - 수정 불가]\n${lockedFactString}`;
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!clientName) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Package className="w-4 h-4" />
            Phase 7
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">2차 유통물 패키지</h1>
          <p className="text-gray-500 text-sm mt-1">검증된 팩트를 바탕으로 매체별 맞춤 콘텐츠를 구조화합니다. 팩트 문구는 수정 불가입니다.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all border ${
              copied ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '복사 완료' : '전체 복사'}
          </button>
          <button className="gradient-btn px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm">
            <Download className="w-4 h-4" />
            ZIP 다운로드
          </button>
        </div>
      </div>

      <div className="bg-[var(--surface-lowest)] rounded-xl border ghost-border shadow-sm overflow-hidden flex flex-col h-[600px]">
        {/* 탭 메뉴 */}
        <div className="flex border-b border-[var(--outline-variant)]">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[var(--primary-container)] text-[var(--primary)]'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-[var(--surface-low)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* 에디터 */}
        <div className="flex-1 p-8 overflow-y-auto bg-[var(--surface-lowest)]">
          <div className="max-w-3xl mx-auto space-y-6">
            <input
              type="text"
              value={`[${clientName} ${usp}] ${activeTab} 배포용`}
              readOnly
              className="text-3xl font-bold text-[var(--foreground)] outline-none border-none w-full bg-transparent tracking-tight"
            />

            {/* 수정 가능 영역 */}
            <textarea
              value={editableContent}
              onChange={(e) => setEditableContent(e.target.value)}
              className="w-full text-base text-[var(--foreground)] leading-relaxed outline-none border-none resize-none min-h-[100px] bg-transparent"
            />

            {/* 수정 불가 영역 */}
            <div className="relative group">
              <div className="bg-gray-100 rounded-lg p-5 border border-gray-300 text-[var(--foreground)] leading-relaxed flex gap-4 items-start">
                <Lock className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 font-bold mb-2">🔒 수정 불가 영역 — AI 학습 필수 사실</p>
                  <p className="font-medium leading-loose">{lockedFactString}</p>
                </div>
              </div>
            </div>

            <textarea
              placeholder="여기에 추가 내용을 작성하세요..."
              className="w-full text-base text-[var(--foreground)] leading-relaxed outline-none border-none resize-none h-[200px] mt-4 bg-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
