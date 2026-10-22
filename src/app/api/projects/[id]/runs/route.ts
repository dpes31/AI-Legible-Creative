import { NextResponse, type NextRequest } from 'next/server';
import { ApiFailure, authenticate, checkMutation, checkedId, fail } from '@/server/auth';
import { executionConfig, inputHash } from '@/server/pipeline';
import { projectSchema } from '@/domain/schema';

type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) {
  try {
    checkMutation(request);
    const { reserve } = executionConfig();
    const id = checkedId((await context.params).id);
    const { db } = await authenticate();
    const { data } = await db.from('projects').select('payload').eq('id', id).maybeSingle();
    if (!data) throw new ApiFailure(404, '프로젝트를 찾지 못했어요.');
    const project = projectSchema.parse(data.payload);
    const { data: runId, error } = await db.rpc('reserve_review_run', {
      p_project: id, p_key: request.headers.get('idempotency-key'), p_hash: inputHash(project), p_reserve: reserve,
    });
    if (error || !runId) throw new ApiFailure(409, '실행 예산이나 중복 요청 상태를 확인해 주세요. 자동 호출을 시작하지 않았습니다.');
    return NextResponse.json({ runId, status: 'pending', reservedUsd: reserve }, { status: 201 });
  } catch (error) { return fail(error); }
}
