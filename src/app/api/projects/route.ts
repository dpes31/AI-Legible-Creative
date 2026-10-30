import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiFailure, authenticate, checkMutation, fail } from '@/server/auth';
import { serverProject } from '@/server/project-store';

export async function GET() {
  try {
    const { db } = await authenticate();
    const { data, error } = await db.from('projects').select('id, revision, payload, updated_at').order('updated_at', { ascending: false });
    if (error) throw new ApiFailure(503, '프로젝트 목록을 불러오지 못했어요.');
    return NextResponse.json({ projects: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) {
  try {
    checkMutation(request);
    const { db, user } = await authenticate();
    const input = z.object({ project: z.unknown() }).parse(await request.json());
    const project = serverProject(input.project, user.id);
    const { data, error } = await db.from('projects').insert({
      id: project.id, owner_id: user.id, revision: 1, payload: { ...project, revision: 1 },
      create_key: request.headers.get('idempotency-key'),
    }).select('payload').single();
    if (error) {
      if (error.code === '23505') throw new ApiFailure(409, '이미 저장된 프로젝트 또는 요청입니다. 목록을 다시 확인해 주세요.');
      throw new ApiFailure(503, '클라우드에 저장하지 못했어요. 로컬 자료는 그대로 남아 있습니다.');
    }
    return NextResponse.json({ project: data.payload }, { status: 201 });
  } catch (error) { return fail(error); }
}
