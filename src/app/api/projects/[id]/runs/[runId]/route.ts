import { NextResponse, type NextRequest } from 'next/server';
import { ApiFailure, authenticate, checkedId, fail } from '@/server/auth';

type Context = { params: Promise<{ id: string; runId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    const { id, runId } = await context.params;
    const { db } = await authenticate();
    const { data: run } = await db.from('runs').select('id,project_id,status,reserved_usd,input_hash').eq('id', checkedId(runId)).eq('project_id', checkedId(id)).maybeSingle();
    if (!run) throw new ApiFailure(404, '실행 기록을 찾지 못했어요.');
    const { data: steps, error } = await db.from('run_steps').select('id,stage,status,result,error,provider_request_id')
      .eq('run_id', run.id).order('created_at');
    if (error) throw new ApiFailure(503, '실행 단계를 불러오지 못했어요.');
    return NextResponse.json({ run, steps }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return fail(error); }
}
