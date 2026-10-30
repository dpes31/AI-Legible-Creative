import { consumerDatasetSchema, consumerObservationSchema, sourceSchema, type Project } from './schema';
import type { ConsumerEvidenceLink } from './question-discovery-schema';
import { captureSource, inspectSource } from './analysis/source-audit';
import { observationDigest, revalidateDiscovery } from './analysis/discovery-integrity';
import { fingerprint } from './text';
import { z } from 'zod';

export function incidentKey(url: string): string {
  const u = new URL(url); u.hash = '';
  if (u.hostname.endsWith('puliodays.com')) u.pathname = u.pathname.replace(/\/page\/\d+\/?$/, '/');
  u.pathname = u.pathname.replace(/\/$/, '');
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|page$|pageid$)/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return fingerprint(u.toString());
}
export function linkConsumerObservation(project: Project, rowId: string, sourceId: string,
  details: Pick<ConsumerEvidenceLink, 'independence' | 'independenceNote' | 'brand' | 'privacyReviewed' | 'privacyNote'>): Project {
  const row = project.consumerObservations.find(r => r.id === rowId);
  const source = project.sources.find(s => s.id === sourceId && s.projectId === project.id);
  const dataset = project.consumerDatasets.find(d => d.id === row?.datasetId);
  if (!row || row.projectId !== project.id || !source || !dataset || dataset.projectId !== project.id || dataset.dataType !== 'customer_verbatim') throw new Error('같은 프로젝트의 소비자 발언 자료와 출처를 선택해 주세요.');
  const text = row.text || row.query || '';
  if (!['review', 'user'].includes(source.sourceType)) throw new Error('공식 발표·판매자 설명은 소비자 원문으로 연결하지 않습니다.');
  const check = inspectSource(source, text);
  if (check.state === 'hold' || !source.body.includes(text) || !text) throw new Error(check.reasons.join(' ') || '원문과 소비자 행이 일치하지 않습니다.');
  if (details.privacyReviewed && details.privacyNote.trim().length < 10) throw new Error('개인정보·원문 범위 검토 이유를 10자 이상 남겨 주세요.');
  if (details.independence === 'declared' && details.independenceNote.trim().length < 10) throw new Error('독립성 대조 이유를 10자 이상 남겨 주세요.');
  const link = { independence: details.independence, independenceNote: details.independenceNote,
    brand: details.brand, privacyReviewed: details.privacyReviewed, privacyNote: details.privacyNote,
    sourceId, snapshotId: check.snapshot!.id, sourceDigest: '',
    incidentId: incidentKey(source.url!), linkedAt: new Date().toISOString() };
  const linked = { ...project, consumerObservations: project.consumerObservations.map(r => r.id === rowId ? { ...r, evidenceLink: link } : r) };
  link.sourceDigest = observationDigest(linked, rowId);
  return revalidateDiscovery(linked);
}

export type ConsumerExcerptInput = {
  title: string; url: string; text: string; publishedAt: string | null; locator: string; interest: string;
  brand: string; independence: 'declared' | 'unknown'; independenceNote: string;
  privacyReviewed: boolean; privacyNote: string; externalAiAllowed: boolean; publicationAllowed: boolean;
};
export function addConsumerExcerpt(project: Project, input: ConsumerExcerptInput): Project {
  if (!input.text.trim() || input.text.length > 5000 || !input.locator.trim()) throw new Error('5천 자 이내의 실제 발췌와 확보 구간을 입력해 주세요.');
  if (project.consumerObservations.length >= 50000) throw new Error('소비자 자료 행 수 한도를 넘었습니다.');
  const now = new Date().toISOString();
  const source = captureSource(sourceSchema.parse({ id: crypto.randomUUID(), projectId: project.id,
    title: input.title, url: input.url, body: input.text, excerpt: input.text, hash: fingerprint(input.text),
    sourceType: 'review', publisher: null, origin: 'direct_input', retrieval: 'partial', collectedAt: now,
    publishedAt: input.publishedAt, externalAiAllowed: input.externalAiAllowed, publicationAllowed: input.publicationAllowed }),
  { method: 'manual_excerpt', locator: input.locator, coverage: 'excerpt', modelScope: [], conditionScope: [], interest: input.interest });
  // Separate consent combinations must never silently widen an existing dataset's rights.
  const name = `수동 소비자 발췌 ${input.externalAiAllowed ? '외부허용' : '외부미허용'} ${input.publicationAllowed ? '공개허용' : '공개미허용'}.txt`;
  const existing = project.consumerDatasets.find(d => d.fileName === name && d.provider === '수동 공개 발췌 장부');
  if (!existing && project.consumerDatasets.length >= 5) throw new Error('자료 묶음은 5개까지 보관합니다. 기존 파일 행에 출처를 연결해 주세요.');
  const dataset = existing || consumerDatasetSchema.parse({ schemaVersion: 1, id: crypto.randomUUID(), projectId: project.id,
    fileName: name, format: 'txt', fileHash: fingerprint(''), dataType: 'customer_verbatim', provider: '수동 공개 발췌 장부',
    market: project.market, periodStart: null, periodEnd: null, metric: '', unit: '', basis: 'unknown',
    sampleScope: '공개 최소 발췌 · 비대표 탐색 표본', mapping: { text: 'text' }, headers: ['text'],
    rowCount: 0, acceptedRows: 0, reviewRows: 0, rejectedRows: 0, externalAiAllowed: input.externalAiAllowed,
    publicationAllowed: input.publicationAllowed, warnings: ['개별 작성자·구매·독립성은 별도 확인 대상입니다.'], importedAt: now });
  const row = consumerObservationSchema.parse({ schemaVersion: 1, id: crypto.randomUUID(), projectId: project.id,
    datasetId: dataset.id, sourceRow: dataset.rowCount + 1, rawRecord: { text: input.text }, importStatus: 'accepted',
    reason: null, query: null, text: input.text, metric: null, value: null, unit: null, basis: 'unknown',
    period: null, market: project.market, relationType: null, relatedQuery: null, sampleScope: dataset.sampleScope, observedAt: input.publishedAt });
  const rows = [...project.consumerObservations, row];
  const updatedDataset = { ...dataset, rowCount: dataset.rowCount + 1, acceptedRows: dataset.acceptedRows + 1,
    fileHash: fingerprint(rows.filter(r => r.datasetId === dataset.id).map(r => r.text).join('\n')) };
  const next = { ...project, sources: [...project.sources, source], consumerObservations: rows,
    consumerDatasets: [...project.consumerDatasets.filter(d => d.id !== dataset.id), updatedDataset] };
  // File contents changing invalidates previous row links; do not recertify them silently.
  return linkConsumerObservation(next, row.id, source.id, input);
}

const excerptSchema = z.object({ title: z.string().min(1).max(5000), url: z.url(), text: z.string().min(1).max(5000),
  publishedAt: z.string().nullable(), locator: z.string().min(1).max(2000), interest: z.string().max(1000),
  brand: z.string().max(300), independence: z.literal('unknown'), independenceNote: z.string().max(2000),
  privacyReviewed: z.literal(false), privacyNote: z.string().max(2000),
  externalAiAllowed: z.literal(false), publicationAllowed: z.literal(false) }).strict();
export function importConsumerExcerptCorpus(project: Project, raw: string): Project {
  if (raw.length > 500000) throw new Error('발췌 묶음이 50만 자를 넘습니다.');
  const corpus = z.object({ contract: z.literal('alc.consumer-excerpts.v1'), collectedAt: z.string().datetime(),
    limitations: z.array(z.string()), excerpts: z.array(excerptSchema).min(1).max(100) }).strict().parse(JSON.parse(raw));
  let next = project;
  for (const excerpt of corpus.excerpts) {
    // Duplicate imports preserve existing consent/review instead of overwriting it.
    if (next.sources.some(s => s.url === excerpt.url && s.body === excerpt.text)) continue;
    next = addConsumerExcerpt(next, { ...excerpt, locator: `${excerpt.locator} · 확보 장부 시각 ${corpus.collectedAt}` });
  }
  return next;
}

export function reviewConsumerRowPermissions(project: Project, rowId: string, details: {
  externalAiAllowed: boolean; publicationAllowed: boolean; privacyReviewed: boolean; privacyNote: string;
  independence: 'declared' | 'unknown'; independenceNote: string; brand: string;
}): Project {
  const row = project.consumerObservations.find(r => r.id === rowId), link = row?.evidenceLink;
  const dataset = project.consumerDatasets.find(d => d.id === row?.datasetId);
  const source = project.sources.find(s => s.id === link?.sourceId);
  if (!row || !dataset || !source || !link) throw new Error('출처가 연결된 소비자 행을 선택해 주세요.');
  if (details.privacyNote.trim().length < 10) throw new Error('권한·비식별 검토 이유를 10자 이상 남겨 주세요.');
  const target = project.consumerDatasets.find(d => d.provider === dataset.provider && d.dataType === dataset.dataType &&
    d.externalAiAllowed === details.externalAiAllowed && d.publicationAllowed === details.publicationAllowed &&
    d.sampleScope === dataset.sampleScope && d.mappingVersion === dataset.mappingVersion && d.fileHash === dataset.fileHash);
  if (!target && project.consumerDatasets.length >= 5) throw new Error('행별 권한을 분리할 자료 묶음 여유가 없습니다. 최대 5개입니다.');
  const moved = target || { ...dataset, id: crypto.randomUUID(), externalAiAllowed: details.externalAiAllowed,
    publicationAllowed: details.publicationAllowed, fileName: dataset.fileName + ' · 권한 분리' };
  const rows = project.consumerObservations.map(r => r.id === rowId ? { ...r, datasetId: moved.id } : r);
  const datasets = [...project.consumerDatasets.filter(d => d.id !== moved.id), moved].map(d => ({ ...d,
    rowCount: rows.filter(r => r.datasetId === d.id).length,
    acceptedRows: rows.filter(r => r.datasetId === d.id && r.importStatus === 'accepted').length,
    reviewRows: rows.filter(r => r.datasetId === d.id && r.importStatus === 'needs_review').length,
    rejectedRows: rows.filter(r => r.datasetId === d.id && r.importStatus === 'rejected').length }));
  let next = { ...project, consumerDatasets: datasets, consumerObservations: rows,
    sources: project.sources.map(s => s.id === source.id ? { ...s, externalAiAllowed: details.externalAiAllowed,
      publicationAllowed: details.publicationAllowed } : s) };
  next = linkConsumerObservation(next, rowId, source.id, details);
  return revalidateDiscovery({ ...next, consumerObservations: next.consumerObservations.map(r => r.id === rowId ? {
    ...r, evidenceLink: { ...r.evidenceLink!, permissionReview: { at: new Date().toISOString(), note: details.privacyNote.trim(),
      externalAiAllowed: details.externalAiAllowed, publicationAllowed: details.publicationAllowed } } } : r) });
}
