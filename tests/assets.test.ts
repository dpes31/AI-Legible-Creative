import { reviewSyntheticEvidence } from './helpers/synthetic-evidence';
import { expect, it } from 'vitest';
import { importSameModelEvidence, improvementSuggestions, recordPublication, saveQuestionAnswer, verifyPublicationText } from '../src/domain/assets';
import { assertProjectRelations, newProject } from '../src/domain/schema';

function project(model = 'A') {
  return newProject({ name: '가상 의자', kind: 'product', model, brandId: 'explicit-brand', brandName: '가상 브랜드',
    category: 'berex', description: '', officialUrl: 'https://example.org/model', objective: 'feature', audience: '',
    audienceUndecided: true, selectedChannels: ['blog'], mode: 'manual' });
}

it('같은 모델 자료만 명시적으로 옮기며 새 작업에서는 주장 검토를 다시 요구한다', () => {
  const from = project();
  from.sources = [{ id: 's', projectId: from.id, title: '가상 공식 원문', url: null, excerpt: '모델 A.', body: '모델 A.',
    sourceType: 'official', retrieval: 'user_provided', origin: 'direct_input', publishedAt: null, collectedAt: from.createdAt,
    publicationAllowed: true, externalAiAllowed: true, hash: 'h' }];
  from.claims = [{ id: 'c', projectId: from.id, sourceId: 's', statement: '모델 A 설명', quote: '모델 A.', conditions: '',
    subject: '가상 의자 A', status: 'supported', reviewedBy: 'human' }];
  expect(() => importSameModelEvidence(project('B'), from)).toThrow('같은 브랜드');
  const reviewed = reviewSyntheticEvidence(from);
  const target = importSameModelEvidence(project(), reviewed);
  reviewed.sources[0].hash = 'fnv1a:changed';
  expect(() => importSameModelEvidence(project(), reviewed)).toThrow('원문');
  expect(target.claims[0].status).toBe('unreviewed');
  expect(target.claims[0].id).not.toBe('c');
  expect(target.sources[0].id).not.toBe('s');
  assertProjectRelations(target);
});

it('게시 URL 기록과 게시 원고 일치 확인을 구분하고 수정 버전을 보존한다', () => {
  const p = project();
  p.documents.blog = { id: 'd', channel: 'blog', revision: 3, evidenceRevision: 0, reviewedBlocks: {},
    validationHash: 'verified', status: 'ready', warnings: [], updatedAt: p.createdAt,
    blocks: [{ id: 'b', kind: 'paragraph', text: '가상 제품 설명', claimRefs: [] }] };
  const saved = recordPublication(p, 'blog', 'https://example.org/published');
  expect(saved.publications[0]).toMatchObject({ documentRevision: 3, status: 'reported', contentSnapshot: '가상 제품 설명' });
  expect(improvementSuggestions(saved).some(item => item.title.includes('게시본 확인'))).toBe(true);
  expect(() => verifyPublicationText(saved, saved.publications[0].id, '실제로 다른 내용')).toThrow('다릅니다');
  const checked = verifyPublicationText(saved, saved.publications[0].id, '가상 제품 설명');
  expect(checked.publications[0].status).toBe('confirmed');
  expect(recordPublication(saved, 'blog', 'https://example.org/published')).toBe(saved);
});

it('고객 질문에 근거 없는 ID를 연결하지 않는다', () => {
  const p = project(); p.questions = [{ id: 'q', text: '무엇인가요?', provenance: 'hypothesis', sourceIds: [] }];
  expect(() => saveQuestionAnswer(p, 'q', '가상 답변', ['없는 주장'])).toThrow('근거');
  const saved = saveQuestionAnswer(p, 'q', '가상 답변', []);
  expect(saved.questionAnswers[0]).toMatchObject({ answer: '가상 답변', status: 'draft' });
});
