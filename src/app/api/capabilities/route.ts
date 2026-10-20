import { NextResponse } from 'next/server';
import { authenticate, fail } from '@/server/auth';
import { capabilities } from '@/server/capabilities';

export async function GET() {
  try { await authenticate(); return NextResponse.json(capabilities(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return fail(error); }
}
