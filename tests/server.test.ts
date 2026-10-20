import { describe, expect, it } from 'vitest';
import { newProject } from '../src/domain/schema';
import { MockProvider, inspectResponse, ProviderFailure } from '../src/server/providers';
import { executionConfig, executeStage, inputHash, nextStage } from '../src/server/pipeline';
import { capabilities } from '../src/server/capabilities';
import { serverProject } from '../src/server/project-store';

function sample() { return newProject({ name: '허구의 햇살 보온병', kind: 'product', description: '시험 자료', officialUrl: '', objective: 'feature', audience: '', audienceUndecided: true, selectedChannels: ['ad_copy', 'blog'], mode: 'manual' }); }
const result = { requestId: 'mock-1', text: '공식 자료를 찾지 못했습니다.', inputTokens: 10, outputTokens: 8, citations: [] };

describe('유료 실행의 경계', () => {
  it('키만 있거나 예산 승인이 없으면 호출 가능 상태가 아니다', () => {
    expect(capabilities({ OPENAI_API_KEY: 'test', OPENAI_RESEARCH_MODEL: 'a', OPENAI_WRITE_MODEL: 'a' }).paidExecutionEnabled).toBe(false);
    expect(() => executionConfig({ OPENAI_API_KEY: 'test', OPENAI_RESEARCH_MODEL: 'a', OPENAI_WRITE_MODEL: 'a', PAID_EXECUTION_ENABLED: 'false' })).toThrow();
    const completeLookingConfig = { OPENAI_API_KEY: 'test', OPENAI_RESEARCH_MODEL: 'a', OPENAI_WRITE_MODEL: 'a',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.org', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public',
      PAID_EXECUTION_ENABLED: 'true', APPROVED_TOTAL_USD: '10', RUN_RESERVE_USD: '1', OPENAI_PRICE_CONFIRMED_AT: new Date().toISOString() };
    expect(capabilities(completeLookingConfig).paidExecutionEnabled).toBe(false);
    expect(() => executionConfig(completeLookingConfig)).toThrow();
  });
  it('단계는 순서대로 한 건씩 고르고 모의 공급자 응답을 전달한다', async () => {
    const project = sample();
    expect(nextStage(project, [])).toBe('research');
    expect(nextStage(project, ['research'])).toBe('normalize');
    expect(nextStage(project, ['research', 'normalize', 'channel:ad_copy', 'channel:blog'])).toBeNull();
    const provider = new MockProvider({ research: result, structured: result });
    expect((await executeStage(provider, 'research', project, 'run-1')).requestId).toBe('mock-1');
    expect((await executeStage(provider, 'normalize', project, 'run-1', result)).text).toBe(result.text);
    expect(inputHash({ ...project, audience: '바뀐 고객' })).not.toBe(inputHash(project));
    expect(inputHash({ ...project, model: '2026년형' })).not.toBe(inputHash(project));
  });
  it('거절·중단·빈 응답을 성공으로 포장하지 않는다', () => {
    expect(() => inspectResponse({ id: 'r', status: 'incomplete', output_text: '', output: [] })).toThrow(ProviderFailure);
    expect(() => inspectResponse({ id: 'r', status: 'completed', output_text: ' ', output: [] })).toThrow(ProviderFailure);
    expect(() => inspectResponse({ id: 'r', status: 'completed', output_text: '거절', output: [{ type: 'message', content: [{ type: 'refusal' }] }] })).toThrow(ProviderFailure);
    const cited = inspectResponse({ id: 'r', status: 'completed', output_text: '자료 인용', output: [{ type: 'message', content: [{ type: 'output_text', annotations: [
      { type: 'url_citation', title: '원문 자료', url: 'https://example.org/a', start_index: 0, end_index: 4 },
    ] }] }] });
    expect(cited.citations).toEqual([{ title: '원문 자료', url: 'https://example.org/a', start: 0, end: 4 }]);
  });
  it('업로드 자료의 소유자와 참조 관계를 서버가 다시 검증하고 과거 승인을 무효화한다', () => {
    const project = sample();
    expect(serverProject(project, 'owner-a').ownerId).toBe('owner-a');
    expect(() => serverProject({ ...project, sources: [{ id: 's', projectId: 'different' }] }, 'owner-a')).toThrow();
  });
});
