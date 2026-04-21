'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 레거시 /extract 경로 → /phase1 리다이렉트
 * 
 * 이유: v2 아키텍처에서 기존 Extract 페이지는 Phase 1의 보조 패널로 통합됨.
 * 북마크나 이전 URL로 접근하는 사용자를 위해 리다이렉트 유지.
 */
export default function ExtractRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/phase1');
  }, [router]);
  return null;
}
