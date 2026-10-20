import { z } from 'zod';
import { channels, newProject, type Project } from '@/domain/schema';

const legacySchema = z.object({
  state: z.object({
    clientName: z.string().trim().min(1), usp: z.string().optional(),
    phase2Questions: z.array(z.object({ id: z.number(), question: z.string(), intent: z.string().optional() })).default([]),
    phase4Facts: z.array(z.object({
      id: z.number(), fact: z.string(), sourceUrl: z.string().optional(), coversQuestions: z.array(z.number()).default([]),
    })).default([]),
    naScript: z.string().default(''), subScript: z.string().default(''),
  }),
});

export function convertLegacy(raw: string): Project {
  const old = legacySchema.parse(JSON.parse(raw)).state;
  const project = newProject({
    name: old.clientName, kind: 'product', description: old.usp ?? '', officialUrl: '',
    objective: 'feature', audience: '', audienceUndecided: true,
    selectedChannels: [...channels], mode: 'manual',
  });
  const questionIds = new Map<number, string>();
  project.questions = old.phase2Questions.map(question => {
    if (questionIds.has(question.id)) throw new Error('이전 자료의 질문 번호가 중복됩니다. 원본을 확인해 주세요.');
    const id = crypto.randomUUID(); questionIds.set(question.id, id);
    return { id, text: question.question, provenance: 'hypothesis' as const, sourceIds: [] };
  });
  const factIds = new Set<number>();
  project.claims = old.phase4Facts.map(fact => {
    if (factIds.has(fact.id)) throw new Error('이전 자료의 근거 번호가 중복됩니다. 원본을 확인해 주세요.');
    factIds.add(fact.id);
    return {
      id: crypto.randomUUID(), projectId: project.id, statement: fact.fact,
      sourceId: null, quote: '', conditions: '', subject: project.name,
      status: 'unreviewed' as const, reviewedBy: null,
    };
  });
  const unresolved = old.phase4Facts.flatMap(fact => fact.coversQuestions.filter(q => !questionIds.has(q)));
  project.previousDraft = [old.naScript, old.subScript].filter(Boolean).join('\n\n') || null;
  project.migrationNote = [
    '이전 자료에서 가져왔습니다. 출처 없는 사실·과거 승인 상태는 다시 확인해 주세요.',
    ...(unresolved.length ? [`연결할 질문을 찾지 못한 이전 번호: ${[...new Set(unresolved)].join(', ')}`] : []),
    ...(project.previousDraft ? ['기존 나레이션·자막은 이전 초안으로 보관했습니다.'] : []),
  ].join(' ');
  project.evidenceRevision = project.claims.length ? 1 : 0;
  return project;
}
