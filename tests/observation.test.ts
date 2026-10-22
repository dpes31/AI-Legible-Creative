import { expect, it } from 'vitest';
import { newProject } from '../src/domain/schema';
import { observationSummary, recordObservation, type ObservationInput } from '../src/domain/observation';

const project = () => newProject({ name: '허구의 의자', kind: 'product', description: '', officialUrl: '', objective: 'feature', audience: '', audienceUndecided: true, selectedChannels: ['blog'], mode: 'manual' });
const base: ObservationInput = { kind: 'postpublish', question: '좁은 방에 맞는 의자?', platform: '시험 서비스', model: '', region: 'KR',
  search: 'unknown', suppliedContent: false, suppliedBrand: false, sourceRevision: null, status: 'measured', answer: '다른 브랜드가 더 맞습니다.',
  citedUrls: [], mention: 'negative', recommended: false, firstRecommended: false, ownedCitation: false, citationChecked: false, note: '' };

it('실패·미측정은 분모에서 제외하고 부정 언급을 추천과 구별한다', () => {
  const p = project(); expect(observationSummary(p, 'postpublish').status).toBe('not_measured');
  const failed = recordObservation(p, { ...base, status: 'failed', answer: '', mention: 'none' });
  expect(observationSummary(failed, 'postpublish')).toMatchObject({ status: 'failed', denominator: 0, failures: 1 });
  const measured = recordObservation(failed, base);
  expect(observationSummary(measured, 'postpublish')).toMatchObject({ denominator: 1, mentions: 1, recommendations: 0, explicitFirst: 0 });
});
it('본문 주입 시험과 일반 검색을 섞거나 첫 등장 위치를 첫 추천으로 단정하지 않는다', () => {
  const p = project();
  expect(() => recordObservation(p, { ...base, suppliedContent: true })).toThrow();
  expect(() => recordObservation(p, { ...base, firstRecommended: true })).toThrow();
  expect(() => recordObservation(p, { ...base, ownedCitation: true })).toThrow();
  const trial = recordObservation(p, { ...base, kind: 'prepublish', suppliedContent: true, suppliedBrand: true, recommended: true });
  expect(observationSummary(trial, 'postpublish').denominator).toBe(0);
  expect(observationSummary(trial, 'prepublish').denominator).toBe(1);
});
