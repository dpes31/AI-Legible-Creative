import { describe, expect, it } from 'vitest';
import { newProject, type ChannelDocument } from '../src/domain/schema';
import { channelCompleteness, quantities, validateDocument } from '../src/domain/validation/document';

function p() {
  const project = newProject({ name: '허구 트리플체어', kind: 'product', model: 'A-1', brandName: '코웨이',
    category: 'berex', youtubePrefix: '[COWAY BEREX]', description: '', officialUrl: 'https://example.org/item',
    objective: 'feature', audience: '', audienceUndecided: true, selectedChannels: ['youtube_description', 'product_page'], mode: 'manual' });
  project.sources = [{ id: 's', projectId: project.id, title: '허구 사양서', url: null, excerpt: '세웠을 때 폭 680mm.',
    body: '세웠을 때 폭 680mm.', sourceType: 'official', retrieval: 'user_provided', origin: 'direct_input',
    publishedAt: null, collectedAt: project.createdAt, externalAiAllowed: true, publicationAllowed: true, hash: 'h' }];
  project.claims = [{ id: 'c', projectId: project.id, sourceId: 's', statement: '폭 680mm', quote: '세웠을 때 폭 680mm.',
    conditions: '세웠을 때', subject: '허구 트리플체어 A-1', status: 'supported', reviewedBy: 'human' }];
  return project;
}
function youtube(headline: string): ChannelDocument {
  return { id: 'd', channel: 'youtube_description', revision: 1, evidenceRevision: 0, reviewedBlocks: {}, validationHash: null,
    status: 'needs_review', warnings: [], updatedAt: new Date().toISOString(), blocks: [
      { id: 't1', kind: 'heading', text: headline, claimRefs: [] },
      { id: 't2', kind: 'heading', text: headline, claimRefs: [] },
      { id: 't3', kind: 'heading', text: headline, claimRefs: [] },
      { id: 'b', kind: 'paragraph', text: '공식 링크 https://example.org/item', claimRefs: [] },
    ] };
}

describe('채널별 본문 완성도', () => {
  it('비렉스 영상 제목의 접두어·제품명·설명과 핵심 기능 형식을 검사한다', () => {
    const project = p();
    expect(channelCompleteness(project, youtube('[COWAY] 허구 트리플체어 | 멋진 의자')).missing.join(' ')).toContain('제목은 브랜드 표기');
    expect(channelCompleteness(project, youtube('[COWAY BEREX] 허구 트리플체어 | 영상 설명과 기능')).missing.join(' ')).toContain('관련 질문');
    expect(channelCompleteness(project, youtube('[COWAY BEREX] 허구 트리플체어 | 영상 설명과 기능')).missing.join(' ')).toContain('영상 제작 전 초안');
  });
  it('허구의 치수와 각도를 단위 정규화해 새로운 수치를 막는다', () => {
    expect(quantities('680mm, 68cm, 150°, 150도')).toEqual(['mm:680', 'mm:680', 'degrees:150', 'degrees:150']);
    const project = p();
    const doc: ChannelDocument = { ...youtube('[COWAY BEREX] 허구 트리플체어 | 폭과 기능'),
      blocks: [{ id: 'b', kind: 'paragraph', text: '세웠을 때 폭 780mm입니다.', claimRefs: ['c'] }] };
    expect(validateDocument(project, doc).status).toBe('blocked');
  });
  it('제목·확인 요청만 있는 상세페이지에 실제 본문 부족을 안내한다', () => {
    const project = p();
    const doc: ChannelDocument = { ...youtube('제품 안내'), channel: 'product_page',
      blocks: [{ id: 'h', kind: 'heading', text: '특징', claimRefs: [] },
        { id: 'b', kind: 'paragraph', text: '제품의 특징을 작성해 주세요.', claimRefs: [] }] };
    const checked = validateDocument(project, doc);
    expect(channelCompleteness(project, checked).complete).toBe(false);
    expect(checked.warnings.join(' ')).toContain('본문');
    expect(checked.warnings.join(' ')).toContain('확인된 세부 기능');
  });
});
