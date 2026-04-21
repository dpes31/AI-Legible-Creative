import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── 타입 정의 ───────────────────────────────────────────────

/** Phase 1: 카테고리 추론 결과 */
export interface Phase1Context {
  industry: string;
  categoryKeywords: string[];
  competitors: string[];
  purchaseDecisionFactors: string[];
  targetCustomer: string;
  // 네이버 연관검색어 보조 데이터 (Phase 1 참고 패널용)
  naverKeywords?: { keyword: string; pcVol: number; mobileVol: number; totalVol: number }[];
}

/** Phase 2: 역설계된 질문 */
export interface Question {
  id: number;
  question: string;
  intent: '추천' | '비교' | '기능' | '가격' | '신뢰성';
}

/** Phase 3: Before 측정 결과 (질문별 × AI별) */
export interface MeasurementResult {
  questionId: number;
  // 각 AI별 우리 브랜드 언급 여부: true=언급 / false=미언급 / null=미측정
  gemini: boolean | null;
  gpt: boolean | null;
  claude: boolean | null;
  perplexity: boolean | null;
}

/** Phase 4: 사실 문장 */
export interface CoreFact {
  id: number;
  fact: string;
  sourceUrl?: string;
  confidence: '상' | '중' | '하';
  coversQuestions: number[]; // Phase 2 질문 ID들
}

/** Phase 5.5: TVC 초안 시안 */
export interface TVCDraft {
  id: number;
  // 각 구간별 [텍스트, 수정가능여부] 쌍
  segments: { text: string; locked: boolean; label: string }[];
}

/** Phase 5.6: 카피 검증 이력 */
export interface CopyIteration {
  version: number;
  naScript: string;
  subScript: string;
  factCoverage: { factId: number; status: 'included' | 'missing' | 'partial' }[];
  simulationScore: number;
  corrections: string[];
  approved: boolean;
  createdAt: string;
}

/** 워크플로우 진행 상태 */
export type PhaseStatus = 'locked' | 'active' | 'done';

// ─── 스토어 인터페이스 ───────────────────────────────────────

interface OriginState {
  // === 입력 ===
  clientName: string;
  usp: string;
  setInput: (clientName: string, usp: string) => void;

  // === Phase별 데이터 ===
  phase1: Phase1Context | null;
  setPhase1: (ctx: Phase1Context) => void;

  phase2Questions: Question[];
  setPhase2Questions: (questions: Question[]) => void;

  phase3Measurements: MeasurementResult[];
  setPhase3Measurements: (results: MeasurementResult[]) => void;

  phase4Facts: CoreFact[];
  setPhase4Facts: (facts: CoreFact[]) => void;

  phase5Guide: string; // 마크다운 형태 카피 가이드
  setPhase5Guide: (guide: string) => void;

  phase55Drafts: TVCDraft[];
  setPhase55Drafts: (drafts: TVCDraft[]) => void;

  copyIterations: CopyIteration[];
  addCopyIteration: (iteration: CopyIteration) => void;

  // === 워크플로우 상태 ===
  // 어떤 Phase까지 완료했는지 추적 — SideNav 뱃지에 사용
  currentPhase: number; // 0=입력, 1~7=Phase 번호
  setCurrentPhase: (phase: number) => void;

  // === NA/자막 (Phase 5.6용) ===
  naScript: string;
  subScript: string;
  setScripts: (na: string, sub: string) => void;

  // === 초기화 ===
  resetAll: () => void;
}

// ─── 초기값 ──────────────────────────────────────────────────

const INITIAL_STATE = {
  clientName: '',
  usp: '',
  phase1: null,
  phase2Questions: [],
  phase3Measurements: [],
  phase4Facts: [],
  phase5Guide: '',
  phase55Drafts: [],
  copyIterations: [],
  currentPhase: 0,
  naScript: '',
  subScript: '',
};

// ─── 스토어 생성 (localStorage 자동 저장) ─────────────────────
// 왜 persist를 사용하는가: 수동 매뉴얼 워크플로우는 여러 번의 브라우저 세션에
// 걸쳐 진행될 수 있다. 중간 결과를 잃지 않기 위해 localStorage에 자동 저장.

export const useOriginStore = create<OriginState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setInput: (clientName, usp) => set({ clientName, usp, currentPhase: 0 }),

      setPhase1: (ctx) => set({ phase1: ctx, currentPhase: 1 }),

      setPhase2Questions: (questions) => set({ phase2Questions: questions, currentPhase: 2 }),

      setPhase3Measurements: (results) => set({ phase3Measurements: results, currentPhase: 3 }),

      setPhase4Facts: (facts) => set({ phase4Facts: facts, currentPhase: 4 }),

      setPhase5Guide: (guide) => set({ phase5Guide: guide, currentPhase: 5 }),

      setPhase55Drafts: (drafts) => set({ phase55Drafts: drafts }),

      addCopyIteration: (iteration) =>
        set((state) => ({
          copyIterations: [...state.copyIterations, iteration],
        })),

      setCurrentPhase: (phase) => set({ currentPhase: phase }),

      setScripts: (naScript, subScript) => set({ naScript, subScript }),

      resetAll: () => set(INITIAL_STATE),
    }),
    {
      name: 'origin-mvp-store', // localStorage 키
    }
  )
);
