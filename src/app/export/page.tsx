'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOriginStore } from '@/store/useOriginStore';
import { Download, Lock, Type, Image as ImageIcon, Link as LinkIcon, AlignLeft, Bold, Italic } from 'lucide-react';

const TABS = ['보도자료 (Press Release)', '블로그포스팅', '유튜브 (YouTube)', '상세페이지 (Wiki)'];

export default function ExportPage() {
  const router = useRouter();
  const { clientName, facts } = useOriginStore();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [editableContent, setEditableContent] = useState(
    '여기에 크리에이티브 후크, 스토리텔링 및 도입부 단락을 입력하세요. 이 섹션은 자유롭게 수정이 가능합니다.'
  );

  useEffect(() => {
    if (!clientName) {
      router.push('/');
    }
  }, [clientName, router]);

  // Create a combined string of all required facts
  const lockedFactString = facts && facts.length > 0 
    ? facts.map(f => f.text).join(' / ')
    : "이 영역은 Phase 1~5에서 추출된 팩트로 채워집니다.";

  if (!clientName) return null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">콘텐츠 패키징 (Content Export)</h1>
          <p className="text-gray-500 text-sm mt-1">Phase 6: 검증된 팩트를 바탕으로 매체별 맞춤형 텍스트를 구조화합니다. (팩트 문구 수정 불가)</p>
        </div>
        <button className="gradient-btn px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm hover:shadow-ambient">
          <Download className="w-4 h-4" />
          패키지 다운로드 (ZIP)
        </button>
      </div>

      <div className="bg-[var(--surface-lowest)] rounded-xl border ghost-border shadow-sm overflow-hidden flex flex-col h-[600px]">
        {/* Tab Menu */}
        <div className="flex border-b border-[var(--outline-variant)]">
          {TABS.map(tab => (
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

        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b border-[var(--outline-variant)]/50 bg-[#fbfbfc]">
          <div className="flex items-center gap-1 bg-[var(--surface-lowest)] border ghost-border p-1 rounded-md">
            <button className="p-1.5 hover:bg-[var(--surface-low)] rounded text-gray-600"><Bold className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-[var(--surface-low)] rounded text-gray-600"><Italic className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-[var(--surface-low)] rounded text-gray-600"><AlignLeft className="w-4 h-4" /></button>
          </div>
          <div className="w-px h-6 bg-gray-200 mx-2"></div>
          <div className="flex items-center gap-1 bg-[var(--surface-lowest)] border ghost-border p-1 rounded-md">
            <button className="p-1.5 hover:bg-[var(--surface-low)] rounded text-gray-600 flex items-center gap-1 text-xs font-semibold">
              <Type className="w-4 h-4" /> Heading
            </button>
            <button className="p-1.5 hover:bg-[var(--surface-low)] rounded text-gray-600"><ImageIcon className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-[var(--surface-low)] rounded text-gray-600"><LinkIcon className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 p-8 overflow-y-auto bg-[var(--surface-lowest)]">
          <div className="max-w-3xl mx-auto space-y-6">
            
            {/* Title */}
            <input 
              type="text" 
              value={`[${clientName} 신제품] ${activeTab} 배포용`}
              readOnly
              className="text-3xl font-bold text-[var(--foreground)] outline-none border-none w-full placeholder:text-gray-300 tracking-tight bg-transparent"
            />

            {/* Editable Block 1 */}
            <textarea 
              value={editableContent}
              onChange={(e) => setEditableContent(e.target.value)}
              className="w-full text-base text-[var(--foreground)] leading-relaxed outline-none border-none resize-none min-h-[100px] bg-transparent"
            />

            {/* Locked Block */}
            <div className="relative group">
              <div className="absolute -left-12 top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-8 h-8 rounded-full bg-[var(--surface-low)] flex items-center justify-center border ghost-border" title="Fact Sentence (Locked)">
                  <Lock className="w-4 h-4 text-gray-400" />
                </div>
              </div>
              <div className="bg-[var(--surface-container-low)] rounded-lg p-5 border ghost-border text-[var(--foreground)] leading-relaxed flex gap-4 items-start">
                <Lock className="w-5 h-5 text-[var(--primary)] shrink-0 mt-0.5 opacity-80" />
                <p className="font-medium leading-loose">{lockedFactString}</p>
              </div>
            </div>

            {/* Editable Block 2 */}
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
