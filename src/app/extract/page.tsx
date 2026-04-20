'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOriginStore } from '@/store/useOriginStore';
import { CheckCircle2, ArrowRight, BrainCircuit, TableProperties, Network } from 'lucide-react';

// Types for the Naver API response
interface NaverKeyword {
  keyword: string;
  pcVol: number;
  mobileVol: number;
  totalVol: number;
}

export default function ExtractPage() {
  const router = useRouter();
  const { clientName, usp, setExtractedData } = useOriginStore();
  // --- React Hook 규칙: 모든 훅은 조건부 return 이전에 선언해야 한다 ---
  const facts = useOriginStore((state) => state.facts);
  
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('네이버 연관검색어 크롤링 중...');
  const [keywordsData, setKeywordsData] = useState<NaverKeyword[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientName) {
      router.push('/');
      return;
    }

    let isMounted = true;

    async function fetchNaverKeywords() {
      try {
        setLoadingText(`'${clientName}' 트렌드 데이터 수집 중...`);

        // --- 핵심 수정: 네이버 검색광고 API hintKeywords 규격 대응 ---
        // 네이버 API는 공백이 포함된 복합어("삼성전자 비스포크")를 거부한다.
        // 공백을 쉼표(,)로 치환하면 복수 키워드로 동시 조회 가능 (최대 5개).
        // 예: "삼성전자 비스포크" → "삼성전자,비스포크" (두 키워드 합집합 반환)
        const sanitizedKeyword = clientName.trim().replace(/\s+/g, ',');

        const BASE_URL = 'https://naver-mindmap.vercel.app/api/keywords';

        // 클라이언트명과 USP를 병렬로 호출하여 검색 데이터를 두 축에서 확보
        const fetchKeyword = async (kw: string): Promise<NaverKeyword[]> => {
          try {
            const res = await fetch(`${BASE_URL}?keyword=${encodeURIComponent(kw)}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.keywords || [];
          } catch {
            return [];
          }
        };

        // USP도 독립 키워드로 병렬 호출 (예: "AI" → AI 관련 연관검색어 확보)
        const sanitizedUsp = usp.trim().replace(/\s+/g, ',');
        const [clientResults, uspResults] = await Promise.all([
          fetchKeyword(sanitizedKeyword),
          fetchKeyword(sanitizedUsp),
        ]);

        if (!isMounted) return;

        // 두 소스의 결과를 합치고, keyword 기준으로 중복 제거
        const mergedMap = new Map<string, NaverKeyword>();
        [...clientResults, ...uspResults].forEach((item: NaverKeyword) => {
          if (!mergedMap.has(item.keyword)) {
            mergedMap.set(item.keyword, item);
          }
        });

        // totalVol(PC+Mobile 합산 검색량) 기준 내림차순 정렬 — 마인드맵 가중치 로직 그대로 이식
        const allKeywords = Array.from(mergedMap.values())
          .sort((a, b) => b.totalVol - a.totalVol)
          .slice(0, 20);

        if (allKeywords.length === 0) {
          throw new Error('검색된 연관 키워드가 없습니다. 입력값을 확인해 주세요.');
        }

        setKeywordsData(allKeywords);
        setLoadingText('검색량 가중치 기반 필터링 및 팩트 도출 중...');

        // 상위 5개 키워드 → 동적 팩트 문장 생성 (추후 LLM이 대체할 영역)
        setTimeout(() => {
          if (!isMounted) return;
          const topKeywords = allKeywords.slice(0, 5);
          const dynamicFacts = topKeywords.map((k: NaverKeyword, i: number) => ({
            id: `f${i}`,
            text: `[${k.keyword}] 월간 검색량 ${k.totalVol.toLocaleString()}건 — '${usp}' USP와 결합 시, 이 키워드를 타깃하는 사실 문장이 AI 학습에 필수적입니다.`,
            found: false,
          }));

          setExtractedData('자동 추론', dynamicFacts);
          setLoading(false);
        }, 1200);

      } catch (err: any) {
        if (isMounted) {
          console.error(err);
          setError(err.message || '데이터를 불러오지 못했습니다.');
          setLoading(false);
        }
      }
    }

    fetchNaverKeywords();

    return () => {
      isMounted = false;
    };
  }, [clientName, usp, router, setExtractedData]);

  if (loading) {
    return (
      <div className="h-[calc(100vh-12rem)] flex flex-col items-center justify-center space-y-8">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-[var(--surface-low)] rounded-full"></div>
          <div className="w-24 h-24 border-4 border-[var(--primary)] rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
          <BrainCircuit className="w-10 h-10 text-[var(--primary)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-[var(--foreground)] animate-pulse">
            Phase 1~2: 대용량 데이터 추출기 작동 중
          </h2>
          <p className="text-gray-500 h-6">
            {loadingText}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-red-50 border border-red-200 rounded-xl text-center">
        <h2 className="text-xl font-bold text-red-600 mb-2">데이터 추출 실패</h2>
        <p className="text-red-500 mb-6">{error}</p>
        <button onClick={() => router.push('/')} className="px-4 py-2 bg-red-600 text-white rounded shadow text-sm">
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  // facts는 이미 컴포넌트 최상단에서 훅으로 구독 중

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">Phase 2: 질문 추출 (데이터 기반 검증)</h1>
        <p className="text-gray-500 text-sm mt-1">네이버 검색망에서 수집한 실제 조회수 가중치(Total Vol)를 기반으로 도출된 결과입니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Data Truth (Keyword Table) */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[var(--primary)] mb-2">
            <TableProperties className="w-5 h-5" />
            <h2 className="font-semibold text-lg text-[var(--foreground)]">검색량 가중치 탑 키워드 (Input Data)</h2>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#f8fafc] text-xs uppercase text-slate-500 sticky top-0 border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Rank</th>
                    <th className="px-4 py-3 font-semibold">관련 질문/키워드</th>
                    <th className="px-4 py-3 font-semibold text-right">PC</th>
                    <th className="px-4 py-3 font-semibold text-right">Mobile</th>
                    <th className="px-4 py-3 font-semibold text-right text-[var(--primary)]">Total Vol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keywordsData.map((k, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 font-medium text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2 font-semibold text-[var(--foreground)]">{k.keyword}</td>
                      <td className="px-4 py-2 text-slate-500 text-right">{k.pcVol.toLocaleString()}</td>
                      <td className="px-4 py-2 text-slate-500 text-right">{k.mobileVol.toLocaleString()}</td>
                      <td className="px-4 py-2 font-bold text-[var(--primary)] text-right">{k.totalVol.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-slate-50 border-t text-xs text-slate-500 text-center">
              수집 모델: Naver Ads API (실시간 TotalVol 정렬)
            </div>
          </div>
        </div>

        {/* Right Column: AI Mapped Facts */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-amber-600 mb-2">
            <Network className="w-5 h-5" />
            <h2 className="font-semibold text-lg text-[var(--foreground)]">동적 도출 팩트 (Dynamic Output)</h2>
          </div>
          <div className="bg-[var(--surface-lowest)] rounded-xl border border-amber-100 shadow-sm p-6 h-full flex flex-col">
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              위의 '검색량 랭킹'과 회장님이 입력하신 <strong>[{usp}]</strong> 정보를 매핑하여 가장 강력하게 권고되는 기계 가독성(Machine-legible) 문장입니다.
              (※ 추후 이 변수들이 GenAI 프롬프트의 재료로 투입됩니다.)
            </p>
            
            <div className="space-y-3 flex-1">
              {facts.map((fact: any) => (
                <div key={fact.id} className="flex items-start gap-3 p-4 rounded-lg bg-white border border-slate-200 hover:border-amber-200 transition-colors shadow-sm">
                  <div className="mt-0.5">
                    <CheckCircle2 className="w-5 h-5 text-amber-500" />
                  </div>
                  <p className="text-[var(--foreground)] font-medium text-sm leading-relaxed">{fact.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100">
              <button 
                onClick={() => router.push('/validation')}
                className="w-full gradient-btn py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
              >
                이 팩트 기준으로 카피 시뮬레이션 하기
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
