import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export class ApiFailure extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function fail(error: unknown) {
  const status = error instanceof ApiFailure ? error.status : 500;
  return NextResponse.json({ error: error instanceof ApiFailure ? error.message : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status });
}

export function checkMutation(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).origin !== request.nextUrl.origin) throw new ApiFailure(403, '요청한 화면을 확인할 수 없습니다. 페이지를 다시 열어 주세요.');
  if (!request.headers.get('idempotency-key')) throw new ApiFailure(400, '요청 식별자가 없습니다. 페이지를 다시 열어 주세요.');
}

export async function authenticate() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiFailure(503, '클라우드 저장이 아직 연결되지 않았어요. 직접 방식으로 계속해 주세요.');
  const cookieStore = await cookies();
  const db = createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(values) { try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* read-only rendering */ } },
    },
  });
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new ApiFailure(401, '로그인한 뒤 다시 시도해 주세요.');
  return { db, user };
}

export function checkedId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiFailure(400, '프로젝트 번호를 확인해 주세요.');
  return value;
}
