import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiFailure, authenticate, checkMutation, checkedId, fail } from '@/server/auth';
import { serverProject } from '@/server/project-store';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const id = checkedId((await context.params).id);
    const { db } = await authenticate();
    const { data, error } = await db.from('projects').select('payload').eq('id', id).maybeSingle();
    if (error || !data) throw new ApiFailure(404, '프로젝트를 찾지 못했어요.');
    return NextResponse.json({ project: data.payload }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    checkMutation(request);
    const id = checkedId((await context.params).id);
    const { db, user } = await authenticate();
    const { revision, project: input } = z.object({ revision: z.number().int().nonnegative(), project: z.unknown() }).parse(await request.json());
    const project = serverProject(input, user.id);
    if (project.id !== id) throw new ApiFailure(422, '프로젝트 번호가 일치하지 않습니다.');
    const next = { ...project, revision: revision + 1, updatedAt: new Date().toISOString() };
    const { data, error } = await db.from('projects').update({ revision: revision + 1, payload: next, updated_at: next.updatedAt })
      .eq('id', id).eq('revision', revision).select('payload').maybeSingle();
    if (error) throw new ApiFailure(503, '클라우드 저장에 실패했습니다.');
    if (!data) throw new ApiFailure(409, '다른 곳에서 수정한 버전이 있습니다. 현재 내용을 백업한 뒤 비교해 주세요.');
    return NextResponse.json({ project: data.payload });
  } catch (error) { return fail(error); }
}
