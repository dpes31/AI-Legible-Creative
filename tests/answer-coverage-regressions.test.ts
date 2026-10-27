import { reviewSyntheticEvidence } from './helpers/synthetic-evidence';
import { describe, expect, it } from 'vitest';
import { newProject } from '../src/domain/schema';
import { approveInsight, reviseInsight } from '../src/domain/insight';
import { attachOriginalText, importContent, importResearch, prepareContent, prepareResearch, reviewDocument } from '../src/domain/workflow';

function evidence() {
  const project = prepareResearch(newProject({ name: '가상 이중 체어', kind: 'product', description: '',
    officialUrl: 'https://example.org/chair', objective: 'sales', audience: '', audienceUndecided: true,
    selectedChannels: ['product_page'], mode: 'manual', category: 'berex' })).project;
  const response = JSON.stringify({ contract: 'alc.research.v3', requestId: project.manualResearchRequestId,
    entity: { name: project.name }, sources: [
      { ref: 'S1', title: '가상 공식 자료', url: 'https://example.org/chair', excerpt: '일반형 A는 등 안마를 제공합니다.', sourceType: 'official' },
      { ref: 'S2', title: '가상 옵션 자료', url: 'https://example.org/options', excerpt: '허리형 B는 목 안마만 제공합니다.', sourceType: 'official' },
    ], claims: [
      { ref: 'C1', statement: '일반형 A는 등 안마를 제공한다', sourceRef: 'S1', quote: '일반형 A는 등 안마를 제공합니다.', conditions: '일반형 A', subject: '가상 이중 체어 일반형 A' },
      { ref: 'C2', statement: '허리형 B는 목 안마만 제공한다', sourceRef: 'S2', quote: '허리형 B는 목 안마만 제공합니다.', conditions: '허리형 B', subject: '가상 이중 체어 허리형 B' },
    ], questions: [
      { ref: 'Q1', text: '등 안마는 가능한가요?', provenance: 'reconstructed', sourceRefs: ['S1'] },
      { ref: 'Q2', text: '허리형 B도 등 안마가 되나요?', provenance: 'reconstructed', sourceRefs: ['S2'] },
    ], comparisons: [], recommendations: [], missingEvidence: [],
    answerPlans: [
      { questionRef: 'Q1', directAnswer: '일반형 A는 등 안마를 제공합니다.', applicableModel: '일반형 A', claimRefs: ['C1'], channels: [{ channel: 'product_page', angle: '등 안마', depth: '모델 조건' }] },
      { questionRef: 'Q2', directAnswer: '허리형 B는 목 안마만 가능합니다.', applicableModel: '허리형 B', claimRefs: ['C2'], channels: [{ channel: 'product_page', angle: '모델 차이', depth: '허리형 제한' }] },
    ] });
  const imported = importResearch(project, response);
  const connected = attachOriginalText(imported, imported.sources[0].id, imported.sources[0].excerpt, true);
  return approveInsight(reviewSyntheticEvidence(connected, [connected.claims[0].id]));
}

function write(project: ReturnType<typeof evidence>, extra: string, feedback = '') {
  const revised = feedback ? approveInsight(reviseInsight(project, feedback)) : project;
  const prepared = prepareContent(revised);
  const response = JSON.stringify({ contract: 'alc.content.v2', requestId: prepared.project.manualContentRequestId,
    inputRevision: revised.inputRevision, evidenceRevision: revised.evidenceRevision, insightRevision: revised.insight.revision,
    documents: [{ channel: 'product_page', blocks: [
      { kind: 'heading', text: '선택 기준', claimRefs: [] },
      { kind: 'paragraph', text: '일반형 A는 등 안마를 제공합니다.', claimRefs: [revised.claims[0].id], questionRefs: [revised.questions[0].id] },
      { kind: 'heading', text: '사용할 공간', claimRefs: [] },
      { kind: 'paragraph', text: extra, claimRefs: [] },
      { kind: 'heading', text: '자주 묻는 질문', claimRefs: [] },
      { kind: 'paragraph', text: '등 안마는 가능한가요? 일반형 A에서 가능합니다. 구매 전 모델을 확인하세요.', claimRefs: [], questionRefs: [revised.questions[0].id] },
      { kind: 'cta', text: '공식몰 구매 조건을 확인하세요.', claimRefs: [] },
    ] }], unresolvedItems: [] });
  return importContent(prepared.project, response);
}

describe('완성 원고의 답변·사실·수정 방향 검사', () => {
  it('선택한 채널의 핵심 모델 질문에 답하지 않으면 최종본으로 통과시키지 않는다', () => {
    const written = write(evidence(), '방 크기와 사용 동선을 먼저 확인하세요.');
    expect(() => reviewDocument(written, 'product_page')).toThrow(/허리형|질문|답변/);
  });
  it('claimRefs를 빼고 새로 넣은 효능 사실을 최종본으로 통과시키지 않는다', () => {
    const written = write(evidence(), '모든 고객의 허리 통증이 사라집니다.');
    expect(() => reviewDocument(written, 'product_page')).toThrow(/근거|사실|확인/);
  });
  it('사용자가 요구한 모델 구분이 원고에서 빠졌으면 반영 완료로 표시하지 않는다', () => {
    const written = write(evidence(), '방 크기와 사용 동선을 먼저 확인하세요.', '허리형 B는 목 안마만 가능하다는 모델 차이를 명시해 주세요.');
    expect(() => reviewDocument(written, 'product_page')).toThrow(/허리형|수정|질문/);
  });
});
