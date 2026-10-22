import { NextResponse, type NextRequest } from 'next/server';
import { ApiFailure, authenticate, checkMutation, checkedId, fail } from '@/server/auth';
import { projectSchema } from '@/domain/schema';
import { executeStage, executionConfig, inputHash, nextStage } from '@/server/pipeline';
import { OpenAIProvider, type ProviderResult } from '@/server/providers';
import { contentImportSchema, researchImportSchema } from '@/domain/schema';

type Context = { params: Promise<{ id: string; runId: string }> };
export async function POST(request: NextRequest, context: Context) {
  let stepId: string | null = null;
  let db: Awaited<ReturnType<typeof authenticate>>['db'] | null = null;
  try {
    checkMutation(request);
    executionConfig();
    ({ db } = await authenticate());
    const { id, runId } = await context.params;
    const projectId = checkedId(id);
    const runKey = checkedId(runId);
    const [{ data: saved }, { data: run }, { data: steps, error: stepsError }] = await Promise.all([
      db.from('projects').select('payload').eq('id', projectId).maybeSingle(),
      db.from('runs').select('id, input_hash, status').eq('id', runKey).eq('project_id', projectId).maybeSingle(),
      db.from('run_steps').select('id, stage, status, result').eq('run_id', runKey).order('created_at'),
    ]);
    if (!saved || !run || stepsError) throw new ApiFailure(404, '실행 기록이나 프로젝트를 찾지 못했어요.');
    const project = projectSchema.parse(saved.payload);
    if (run.input_hash !== inputHash(project)) throw new ApiFailure(409, '분석 중 입력이 바뀌었습니다. 이전 실행을 보관하고 새 실행을 만들어 주세요.');
    if (steps?.some(s => ['running', 'uncertain', 'interrupted', 'failed'].includes(s.status))) throw new ApiFailure(409, '이전 호출의 완료·과금 상태를 먼저 확인해 주세요. 자동 재호출하지 않습니다.');
    const stage = nextStage(project, (steps || []).filter(s => s.status === 'succeeded').map(s => s.stage));
    if (!stage) return NextResponse.json({ status: 'drafts_ready_for_review', steps: steps?.length ?? 0 });
    const { data: leased, error: leaseError } = await db.rpc('claim_review_step', {
      p_run: runKey, p_stage: stage, p_hash: run.input_hash,
    });
    if (leaseError || !leased) throw new ApiFailure(409, '이미 실행 중이거나 확인이 필요한 단계입니다. 기록을 확인해 주세요.');
    stepId = leased;
    const prior = (steps || []).find(s => s.stage === 'research')?.result as ProviderResult | undefined;
    const provider = new OpenAIProvider(process.env.OPENAI_API_KEY!);
    const result = await executeStage(provider, stage, project, runKey, prior);
    if (stage !== 'research') {
      const parsed = stage === 'normalize' ? researchImportSchema.safeParse(JSON.parse(result.text)) : contentImportSchema.safeParse(JSON.parse(result.text));
      if (!parsed.success || parsed.data.requestId !== runKey) throw new ApiFailure(422, 'AI 응답의 형식이나 요청 ID를 확인할 수 없습니다. 원문은 실행 기록에서 확인해 주세요.');
    }
    const { error: finishError } = await db.rpc('finish_review_step', {
      p_step: stepId, p_state: 'succeeded', p_result: result, p_request_id: result.requestId, p_error: null,
    });
    if (finishError) throw new ApiFailure(503, '응답은 왔지만 기록 저장에 실패했습니다. 새 호출 전 실행 기록을 확인해 주세요.');
    stepId = null;
    return NextResponse.json({ stage, status: 'succeeded', result });
  } catch (error) {
    if (stepId && db) await db.rpc('finish_review_step', {
      p_step: stepId, p_state: 'uncertain', p_result: null, p_request_id: null,
      p_error: error instanceof Error ? error.message.slice(0, 500) : '응답 확인 불가',
    });
    return fail(error);
  }
}
