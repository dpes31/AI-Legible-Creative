import { type Project } from '@/domain/schema';
import { importContent, importResearch } from '@/domain/workflow';
import { approveInsight, insightCurrent } from '@/domain/insight';
import { executeStage, inputHash, plannedStages, type Stage } from './pipeline';
import { type ProviderAdapter, type ProviderResult } from './providers';

// Development-only state machine. It shares the domain imports with manual mode;
// no route instantiates it, and it never silently substitutes for an API failure.
export type MockStep = { stage: Stage; status: 'pending' | 'succeeded' | 'failed' | 'uncertain'; result?: ProviderResult; error?: string };
export type MockRun = { requestId: string; inputHash: string; project: Project; steps: MockStep[] };

export function beginMockRun(project: Project, requestId: string): MockRun {
  return { requestId, inputHash: inputHash(project), project,
    steps: plannedStages(project).map(stage => ({ stage, status: 'pending' })) };
}

export async function advanceMockRun(run: MockRun, provider: ProviderAdapter): Promise<MockRun> {
  if (inputHash(run.project) !== run.inputHash) throw new Error('실행 중 원래 입력이 바뀌었습니다. 이전 결과를 현재 작업에 덮어쓰지 않습니다.');
  if (run.steps.some(step => step.status === 'uncertain' || step.status === 'failed'))
    throw new Error('완료 또는 과금 여부를 모르는 요청이 있습니다. 자동으로 재호출하지 않습니다.');
  const index = run.steps.findIndex(step => step.status === 'pending');
  if (index < 0) return run;
  const step = run.steps[index];
  if (step.stage.startsWith('channel:') && !insightCurrent(run.project)) {
    return { ...run, steps: run.steps.map((item, i) => i === index ? {
      ...item, status: 'failed', error: '현재 분석의 핵심 인사이트를 먼저 확인해 주세요.',
    } : item) };
  }
  const previous = run.steps.find(item => item.stage === 'research')?.result;
  let result: ProviderResult;
  const stageRequestId = step.stage.startsWith('channel:') ? `${run.requestId}:${step.stage.slice(8)}` : run.requestId;
  try { result = await executeStage(provider, step.stage, run.project, stageRequestId, previous); }
  catch (cause) { return { ...run, steps: run.steps.map((item, i) => i === index ? {
    ...item, status: 'uncertain', error: cause instanceof Error ? cause.message : '응답 확인 불가',
  } : item) }; }
  let project = run.project;
  try {
    if (step.stage === 'normalize') project = importResearch({ ...project, manualResearchRequestId: run.requestId }, result.text);
    else if (step.stage.startsWith('channel:')) {
      if (project.insight.approval === 'pending') {
        // The mock must not silently approve user strategy or source semantics.
        throw new Error('핵심 인사이트의 사용자 확인이 필요합니다.');
      }
      const channel = step.stage.slice(8) as Project['selectedChannels'][number];
      project = importContent({ ...project, manualContentRequestId: stageRequestId, contentRequestChannels: [channel] }, result.text);
    }
  } catch (cause) { return { ...run, steps: run.steps.map((item, i) => i === index ? {
    ...item, status: 'failed', result, error: cause instanceof Error ? cause.message : '응답 형식 오류',
  } : item) }; }
  return { ...run, project, steps: run.steps.map((item, i) => i === index ? { ...item, status: 'succeeded', result } : item) };
}

export function reviewMockInsight(run: MockRun, outline = false): MockRun {
  return { ...run, project: approveInsight(run.project, outline) };
}
