import { create } from 'zustand';

export interface Fact {
  id: string | number;
  text: string;
  found?: boolean;
}

interface OriginState {
  // Phase 1 Input
  clientName: string;
  usp: string;
  setPhase1Input: (clientName: string, usp: string) => void;

  // Phase 2-5 Extracted Facts (Mock data from Phase 1-5)
  category: string;
  facts: Fact[];
  setExtractedData: (category: string, facts: Fact[]) => void;

  // Phase 5.6 Copy Validation Intput
  naScript: string;
  subScript: string;
  setScripts: (na: string, sub: string) => void;

  // Clear state for new project
  resetWorkspace: () => void;
}

export const useOriginStore = create<OriginState>((set) => ({
  // Initial state
  clientName: '',
  usp: '',

  category: '',
  facts: [],

  naScript: '',
  subScript: '',

  // Actions
  setPhase1Input: (clientName, usp) => set({ clientName, usp }),
  
  setExtractedData: (category, facts) => set({ category, facts }),
  
  setScripts: (naScript, subScript) => set({ naScript, subScript }),

  resetWorkspace: () => set({
    clientName: '',
    usp: '',
    category: '',
    facts: [],
    naScript: '',
    subScript: ''
  })
}));
