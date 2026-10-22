import { expect, it } from 'vitest';
import { newProject } from '../src/domain/schema';
import { advanceMockRun, beginMockRun, reviewMockInsight } from '../src/server/mock-run';
import { type ProviderAdapter, type ProviderResult } from '../src/server/providers';
import { reviseInsight } from '../src/domain/insight';

const reply = (text: string): ProviderResult => ({ requestId: 'provider-id', text, inputTokens: 10, outputTokens: 30, citations: [] });
const sample = () => newProject({ name: '허구 솔담 의자', kind: 'product', description: '허구 자료', officialUrl: '',
  objective: 'feature', audience: '', audienceUndecided: true, selectedChannels: ['ad_copy', 'blog'], mode: 'manual' });
function provider(requestId: string): ProviderAdapter {
  return { research: async () => reply('자료 본문: 가상의 특징'), validateClaims: async () => reply('{}'),
    generateStructured: async (prompt, kind) => kind === 'research' ? reply(JSON.stringify({
      contract: 'alc.research.v1', requestId, entity: { name: '허구 솔담 의자' },
      sources: [{ ref: 'S1', title: '허구 원문', url: null, excerpt: '가상의 특징', sourceType: 'user' }],
      claims: [], questions: [], comparisons: [], recommendations: [], missingEvidence: [],
    })) : reply(JSON.stringify({ contract: 'alc.content.v1',
      requestId: prompt.includes('채널 blog') ? `${requestId}:blog` : `${requestId}:ad_copy`,
      documents: [{ channel: prompt.includes('채널 blog') ? 'blog' : 'ad_copy',
        blocks: [{ kind: 'heading', text: '허구 자료 보완용 제목', claimRefs: [] }] }], unresolvedItems: [] })) };
}

it('모의 조사→인사이트 확인→두 채널은 한 단계씩 반영하고 빈약한 원고는 구성안으로 남는다', async () => {
  const adapter = provider('run-1'); let run = beginMockRun(sample(), 'run-1');
  run = await advanceMockRun(run, adapter); expect(run.steps[0].status).toBe('succeeded');
  run = await advanceMockRun(run, adapter); expect(run.project.sources).toHaveLength(1);
  expect(run.project.claims).toHaveLength(0);
  run = reviewMockInsight(run, true);
  run = await advanceMockRun(run, adapter); expect(run.project.documents.ad_copy?.status).toBe('outline');
  run = await advanceMockRun(run, adapter); expect(run.project.documents.blog?.status).toBe('outline');
  expect(run.steps.map(s => s.status)).toEqual(['succeeded', 'succeeded', 'succeeded', 'succeeded']);
  expect((await advanceMockRun(run, adapter)).project.documents).toEqual(run.project.documents);
});

it('전송 뒤 응답을 잃은 단계는 불확실로 보존하고 자동 재호출하지 않는다', async () => {
  let calls = 0;
  const adapter: ProviderAdapter = { research: async () => { calls++; throw new Error('연결 종료'); },
    generateStructured: async () => reply('{}'), validateClaims: async () => reply('{}') };
  const run = await advanceMockRun(beginMockRun(sample(), 'lost'), adapter);
  expect(run.steps[0].status).toBe('uncertain');
  await expect(advanceMockRun(run, adapter)).rejects.toThrow('자동으로 재호출하지 않습니다');
  expect(calls).toBe(1);
});

it('모의 자동 작성도 사용자가 검수한 인사이트와 수정 의견을 공통 brief로 전달한다', async () => {
  let run = beginMockRun(sample(), 'run-brief');
  const prompts: string[] = [];
  const base = provider('run-brief');
  const adapter: ProviderAdapter = { ...base, generateStructured: async (prompt, kind) => {
    if (kind === 'content') prompts.push(prompt);
    return base.generateStructured(prompt, kind);
  } };
  run = await advanceMockRun(run, adapter);
  run = await advanceMockRun(run, adapter);
  run = { ...run, project: reviseInsight(run.project, '좁은 책상 공간에서의 선택 기준을 먼저 설명해 주세요.') };
  run = reviewMockInsight(run, true);
  run = await advanceMockRun(run, adapter);
  expect(run.steps[2].status).toBe('succeeded');
  expect(prompts[0]).toContain('alc.brief.v1');
  expect(prompts[0]).toContain('좁은 책상 공간에서의 선택 기준');
  expect(prompts[0]).toContain('direction_only');
  expect(prompts[0]).toContain('allowedClaims');
});

it('인사이트 검수 전에는 모의 자동 작성도 공급자 호출 없이 멈춘다', async () => {
  let calls = 0;
  const base = provider('run-pending');
  const adapter: ProviderAdapter = { ...base, generateStructured: async (prompt, kind) => {
    if (kind === 'content') calls++;
    return base.generateStructured(prompt, kind);
  } };
  let run = beginMockRun(sample(), 'run-pending');
  run = await advanceMockRun(run, adapter);
  run = await advanceMockRun(run, adapter);
  run = await advanceMockRun(run, adapter);
  expect(run.steps[2].status).toBe('failed');
  expect(calls).toBe(0);
});
