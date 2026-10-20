import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';

export class ApiFailure extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function fail(error: unknown) {
  const status = error instanceof ApiFailure ? error.status : error instanceof SyntaxError ? 400 : error instanceof ZodError ? 422 : 500;
  const message = error instanceof ApiFailure ? error.message : error instanceof SyntaxError ? '입력 형식을 읽지 못했어요. 다시 입력해 주세요.' :
    error instanceof ZodError ? '입력한 자료의 형식과 필수 항목을 확인해 주세요.' : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  return NextResponse.json({ error: message }, { status });
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
  const owner = process.env.ALLOWED_OWNER_EMAIL;
  if (!owner || user.email?.toLowerCase() !== owner.toLowerCase()) {
    throw new ApiFailure(403, '이 검수판의 승인된 계정으로 로그인해 주세요.');
  }
  return { db, user };
}

export function checkedId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiFailure(400, '프로젝트 번호를 확인해 주세요.');
  return value;
}
