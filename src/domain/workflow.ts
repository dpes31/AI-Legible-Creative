import {
  contentImportSchema, contentV2Schema, researchImportSchema, researchV2Schema, channels, channelNames,
  type ChannelDocument, type Claim, type Project, type ResearchImport, type ResearchV2Import, type Source,
} from './schema';
import { z } from 'zod';
import { channelRoles, researchLimits } from './analysis/strategy';
import { koreanRules, promptVersion, researchRules } from '@/lib/prompts/rules';
import { fingerprint, normalize } from './text';
import { channelCompleteness, validateDocument } from './validation/document';
import { buildContentBrief } from './content-brief';
import { insightCurrent } from './insight';
export { fingerprint } from './text';
export { validateDocument } from './validation/document';

export class ImportError extends Error {}
export class EntityMismatch extends ImportError {
  constructor(readonly expected: string, readonly received: string) {
    super(`대상 이름이 달라요. 현재 작업: ${expected} / 조사 응답: ${received}. 같은 제품인지 확인해 주세요.`);
  }
}

function markdownResponse(cleaned: string): unknown {
  const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const contract = lines[0]?.replace(/^#\s*/, '');
  if (contract !== 'alc.research.v1' && contract !== 'alc.content.v1') throw new ImportError('응답에서 필요한 항목을 찾지 못했어요. 원문은 남아 있습니다.');
  const requestId = lines.find(line => /^requestId\s*:/i.test(line))?.split(':').slice(1).join(':').trim();
  if (!requestId) throw new ImportError('응답의 요청 ID를 찾지 못했어요.');
  const sections = new Map<string, string[]>();
  let section = '';
  for (const line of lines.slice(1)) {
    if (line.startsWith('## ')) { section = line.slice(3).trim(); sections.set(section, []); }
    else if (line.startsWith('- ') && section) sections.get(section)?.push(line.slice(2));
  }
  const rows = (key: string, maximum = 8) => (sections.get(key) || []).map(line => {
    const fields = line.split(' | ').map(s => s.trim());
    if (fields.length > maximum) throw new ImportError('표 안의 구분 기호가 본문과 섞였습니다. 같은 요청문으로 JSON 응답을 다시 받아 주세요. 원문은 남아 있습니다.');
    return fields;
  });
  const refs = (value = '') => value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  if (contract === 'alc.content.v1') {
    const documents = channels.flatMap(channel => sections.has(channel) ? [{ channel,
      blocks: rows(channel, 3).map(([kind, body, claimRefs = '']) => ({ kind, text: body, claimRefs: refs(claimRefs) })),
    }] : []);
    return { contract, requestId, documents, unresolvedItems: (sections.get('unresolvedItems') || []) };
  }
  const entity = lines.find(line => /^entity\s*:/i.test(line))?.split(':').slice(1).join(':').trim();
  if (!entity) throw new ImportError('응답의 대상 이름을 찾지 못했어요.');
  return { contract, requestId, entity: { name: entity },
    sources: rows('sources', 7).map(([ref, title, url = '', excerpt = '', sourceType = 'user', publisher = '', publishedAt = '']) => ({ ref, title, url: url || null, excerpt, sourceType, publisher: publisher || null, publishedAt: publishedAt || null })),
    claims: rows('claims', 6).map(([ref, statement, sourceRef = '', quote = '', conditions = '', subject = entity]) => ({ ref, statement, sourceRef: sourceRef || null, quote, conditions, subject })),
    questions: rows('questions', 4).map(([ref, question, provenance = 'hypothesis', sourceRefs = '']) => ({ ref, text: question, provenance, sourceRefs: refs(sourceRefs) })),
    comparisons: rows('comparisons', 6).map(([ref, competitor, criterion, own = '', other = '', reason = '']) => ({ ref, competitor, criterion, ownClaimRefs: refs(own), otherClaimRefs: refs(other), comparable: false, verdict: 'unknown', reason })),
    recommendations: rows('recommendations', 6).map(([ref, situation, reason, claimRefs = '', comparisonRefs = '', limitation = '']) => ({ ref, situation, reason, claimRefs: refs(claimRefs), comparisonRefs: refs(comparisonRefs), limitation })),
    missingEvidence: (sections.get('missingEvidence') || []),
  };
}

function parseResponse(text: string): unknown {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  const fenced = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (cleaned.startsWith('# alc.')) return markdownResponse(cleaned);
  try { return JSON.parse(fenced ? fenced[1] : cleaned); }
  catch { throw new ImportError('응답 형식을 읽지 못했어요. 요청문을 다시 보내거나 원문을 보관한 뒤 직접 수정해 주세요.'); }
}

export function prepareResearch(project: Project): { project: Project; prompt: string } {
  const requestId = project.manualResearchRequestId || crypto.randomUUID();
  const sharedSources = project.sources.filter(s => s.externalAiAllowed);
  const sharedText = sharedSources.map(s => `${s.title} — ${s.body}`).join('\n');
  if (sharedText.length > 50000) throw new ImportError('외부 AI에 보낼 자료가 너무 깁니다. 필요한 원문 부분만 남겨 주세요.');
  return {
    project: { ...project, manualResearchRequestId: requestId },
    prompt: [
      `요청문 버전: ${promptVersion}`,
      '다음 브랜드·제품을 조사해 주세요. 모르는 사실을 추측하거나 URL·수치·시험 조건을 만들지 마세요.',
      ...researchRules,
      `요청 ID: ${requestId}`,
      `대상: ${project.name} (${project.kind}); 소속 브랜드: ${project.brandName || '미지정'}; 제품군: ${project.category}; 모델: ${project.model || '미지정'}; 사용자 설명(검증 전): ${project.description || '제공되지 않음'}`,
      `공식 링크: ${project.officialUrl || '제공되지 않음'}`,
      `목적: ${project.objective}; 고객 상황: ${project.audienceUndecided ? '아직 정하지 않음' : project.audience}`,
      `외부 AI 전달을 허용한 자료: ${sharedText || '없음'}`,
      '자사 사실, 고객의 실제 질문과 추정 질문, 같은 조건의 경쟁 제품, 반대 근거와 부족한 자료를 구분해 주세요.',
      '공식 자료 기재와 독립 시험 결과를 구별하고, 찾지 못한 경쟁사 자료를 기능 부재로 해석하지 마세요.',
      'JSON만 반환하세요. 필수 항목은 contract, requestId, entity, sources, claims, questions, comparisons, recommendations, missingEvidence입니다.',
      `contract는 alc.research.v2, requestId는 ${requestId}, entity는 {"name":"${project.name.replaceAll('"', '\\"')}"}입니다. 기존 v1 응답도 읽지만 질문 맥락·미충족 요구가 빠집니다.`,
      'sources 각 항목: {"ref":"S1","title":"문서명","url":null,"excerpt":"실제 확인한 원문","sourceType":"official|test|independent|review|user"}.',
      'claims 각 항목: {"ref":"C1","statement":"검증할 주장","sourceRef":"S1","quote":"원문의 정확한 구간","conditions":"조건","subject":"정확한 대상·모델"}. 모델을 지정한 제품은 subject에도 해당 모델명을 넣으세요.',
      'questions 각 항목: {"ref":"Q1","text":"고객 질문","provenance":"observed|reconstructed|hypothesis","sourceRefs":["S1"],"situation":"상황","need":"필요","painPoint":"불편","decisionCriteria":["기준"]}.',
      '추가 배열: questionClusters [{"label":"의미가 같은 질문 묶음","questionRefs":["Q1"]}], unmetNeeds [{"situation":"상황","need":"미충족 요구","provenance":"observed|reconstructed|hypothesis","sourceRefs":["S1"]}], productCandidates [{"name":"제품","model":"모델","category":"제품군","status":"조사 상태"}], existingContent [{"title":"기존 콘텐츠","url":null,"gap":"이 질문에서 부족한 설명"}]. 조사하지 못한 항목은 빈 배열로 두세요.',
      'comparisons 각 항목: {"ref":"K1","competitor":"대상","criterion":"비교 기준","ownClaimRefs":["C1"],"otherClaimRefs":[],"comparable":false,"verdict":"unknown","reason":"비교 자료 부족"}.',
      'recommendations 각 항목: {"ref":"R1","situation":"고객 상황","reason":"선택 이유","claimRefs":["C1"],"comparisonRefs":["K1"],"limitation":"적용되지 않는 경우"}.',
      '근거가 없으면 배열을 비워 두고 missingEvidence에 필요한 자료를 적으세요. 조사 결과의 verified/confidence 표시는 검증 완료가 아닙니다.',
      'JSON을 만들 수 없는 경우만 정확한 Markdown 형식으로 보내세요: # alc.research.v1 / requestId: 위 ID / entity: 대상명 / ## sources 아래 - S1 | 자료명 | URL 또는 빈칸 | 실제 원문 | user | 발행 주체 또는 빈칸 | 발행일 또는 빈칸 / ## claims 아래 - C1 | 주장 | S1 | 실제 인용 | 조건 | 대상 / ## questions 아래 - Q1 | 질문 | hypothesis | S1 / ## comparisons 아래 - K1 | 경쟁 대상 | 기준 | 자사 주장 ref | 경쟁 주장 ref | 확인할 내용 / ## recommendations 아래 - R1 | 고객 상황 | 선택 이유 | C1 | K1 | 한계 / ## missingEvidence 아래 - 필요한 자료. 각 항목은 새 줄이며 여러 ref는 쉼표로 구분합니다. 문장 안에 구분 기호를 넣지 마세요.',
    ].join('\n\n'),
  };
}

function uniqueRefs(items: { ref: string }[]) {
  const refs = items.map(x => x.ref);
  if (new Set(refs).size !== refs.length) throw new ImportError('응답의 자료 번호가 중복됩니다. 조사 요청문으로 다시 받아 주세요.');
}

function researchImportError(issues: z.ZodIssue[]): string {
  const sections: Record<string, string> = {
    contract: '응답 버전', requestId: '요청 ID', entity: '조사 대상', sources: '출처',
    claims: '주장', questions: '고객 질문', questionClusters: '질문 묶음',
    unmetNeeds: '미충족 요구', productCandidates: '제품 후보', existingContent: '기존 콘텐츠',
    comparisons: '경쟁 비교', recommendations: '추천 이유', missingEvidence: '추가 확인 사항',
  };
  const fields: Record<string, string> = {
    name: '이름', model: '모델명', verdict: '판단 표기', url: '링크',
    ref: '자료 번호', sourceRef: '출처 번호', quote: '인용문', sourceRefs: '출처 번호',
    ownClaimRefs: '자사 주장 번호', otherClaimRefs: '비교 대상 주장 번호',
    claimRefs: '주장 번호', comparisonRefs: '비교 번호', questionRefs: '질문 번호',
  };
  const descriptions = issues.slice(0, 5).map(issue => {
    const [section, index, field] = issue.path;
    const prefix = sections[String(section)] || '입력';
    const position = typeof index === 'number' ? ` ${index + 1}번` : '';
    const name = fields[String(typeof index === 'number' ? field : index)] || '내용';
    return `${prefix}${position}의 ${name}`;
  });
  return `조사 응답에서 확인할 항목이 있어요: ${descriptions.join(' · ')}${issues.length > 5 ? ` 외 ${issues.length - 5}건` : ''}. 붙여넣은 내용은 보관돼 있어요.`;
}

function validateResearchRefs(data: ResearchImport | ResearchV2Import): void {
  const sources = new Set(data.sources.map(x => x.ref));
  const claims = new Set(data.claims.map(x => x.ref));
  const questions = new Set(data.questions.map(x => x.ref));
  const comparisons = new Set(data.comparisons.map(x => x.ref));
  const missing: string[] = [];
  const check = (refs: string[], available: Set<string>, location: string) => {
    for (const ref of refs) if (!available.has(ref)) missing.push(`${location}의 ${ref}`);
  };
  for (const x of data.claims) check(x.sourceRef ? [x.sourceRef] : [], sources, `주장 ${x.ref} 출처`);
  for (const x of data.questions) check(x.sourceRefs, sources, `질문 ${x.ref} 출처`);
  if (data.contract === 'alc.research.v2') {
    for (const x of data.questionClusters) check(x.questionRefs, questions, `질문 묶음 ${x.label}`);
    for (const x of data.unmetNeeds) check(x.sourceRefs, sources, `미충족 요구 ${x.situation}`);
  }
  for (const x of data.comparisons) {
    check(x.ownClaimRefs, claims, `비교 ${x.ref} 자사 주장`);
    check(x.otherClaimRefs, claims, `비교 ${x.ref} 비교 대상 주장`);
  }
  for (const x of data.recommendations) {
    check(x.claimRefs, claims, `추천 ${x.ref} 주장`);
    check(x.comparisonRefs, comparisons, `추천 ${x.ref} 비교`);
  }
  if (missing.length) throw new ImportError(`조사 응답의 연결 번호를 확인해 주세요: ${missing.slice(0, 5).join(' · ')}${missing.length > 5 ? ` 외 ${missing.length - 5}건` : ''}. 붙여넣은 내용은 보관돼 있어요.`);
}

export function importResearch(project: Project, response: string, confirmSameEntity = false): Project {
  const raw = parseResponse(response);
  const parsed = (raw && typeof raw === 'object' && 'contract' in raw && raw.contract === 'alc.research.v2' ? researchV2Schema : researchImportSchema).safeParse(raw);
  if (!parsed.success) throw new ImportError(researchImportError(parsed.error.issues));
  const data: ResearchImport | ResearchV2Import = parsed.data;
  const priorReceipt = project.importReceipts.find(r => r.requestId === data.requestId && r.contract === data.contract);
  if (priorReceipt?.responseHash === fingerprint(response)) return project;
  if (priorReceipt) throw new ImportError('이미 가져온 요청에 다른 응답이 들어왔습니다. 새 조사 요청문을 만들어 주세요.');
  if (data.sources.length > researchLimits.sources || data.questions.length > researchLimits.questions || new Set(data.comparisons.map(c => c.competitor)).size > researchLimits.competitors) throw new ImportError('조사 범위를 넘었습니다. 자료 20개·질문 12개·경쟁 후보 3개 이내로 정리해 주세요. 원문은 그대로 남아 있습니다.');
  if (!project.manualResearchRequestId || data.requestId !== project.manualResearchRequestId) throw new ImportError('현재 프로젝트의 조사 응답이 아닙니다. 요청 ID를 확인해 주세요.');
  if (normalize(data.entity.name).toLowerCase() !== normalize(project.name).toLowerCase() && !confirmSameEntity) {
    throw new EntityMismatch(project.name, data.entity.name);
  }
  if (!data.sources.length && !data.claims.length && !data.recommendations.length) throw new ImportError('응답에 조사 자료가 없습니다. 공식 자료나 제품 설명을 추가해 주세요.');
  [data.sources, data.claims, data.questions, data.comparisons, data.recommendations].forEach(uniqueRefs);
  validateResearchRefs(data);
  const now = new Date().toISOString();
  const sourceIds = new Map(data.sources.map(x => [x.ref, crypto.randomUUID()]));
  const questionIds = new Map(data.questions.map(x => [x.ref, crypto.randomUUID()]));
  const claimIds = new Map(data.claims.map(x => [x.ref, crypto.randomUUID()]));
  const comparisonIds = new Map(data.comparisons.map(x => [x.ref, crypto.randomUUID()]));
  const requireRef = (map: Map<string, string>, ref: string) => {
    const value = map.get(ref); if (!value) throw new ImportError(`응답의 참조 번호 ${ref}에 연결할 자료가 없습니다.`); return value;
  };
  const sources: Source[] = data.sources.map(x => ({
    id: requireRef(sourceIds, x.ref), projectId: project.id, title: x.title, url: x.url,
    excerpt: x.excerpt, body: x.excerpt, sourceType: x.sourceType,
    retrieval: 'user_provided', origin: 'external_response', collectedAt: now,
    externalAiAllowed: true, publicationAllowed: false,
    publisher: x.publisher ?? null, publishedAt: x.publishedAt ?? null,
    duplicateGroupId: fingerprint(x.url || normalize(x.excerpt)), hash: fingerprint(x.excerpt),
  }));
  const otherOnlyClaimRefs = new Set(data.comparisons.filter(c =>
    !normalize(c.competitor).includes(normalize(project.name))).flatMap(c => c.otherClaimRefs)
    .filter(ref => !data.comparisons.some(c => c.ownClaimRefs.includes(ref))));
  const claims: Claim[] = data.claims.map(x => {
    const sourceId = x.sourceRef ? requireRef(sourceIds, x.sourceRef) : null;
    return {
      id: requireRef(claimIds, x.ref), projectId: project.id, statement: x.statement,
      sourceId, quote: x.quote, conditions: x.conditions, subject: x.subject || project.name,
      status: 'unreviewed', reviewedBy: null,
      target: otherOnlyClaimRefs.has(x.ref) ? 'competitor' : 'own',
    };
  });
  const unmatchedQuotes = data.claims.filter(x => {
    const source = data.sources.find(s => s.ref === x.sourceRef);
    return source && x.quote && !normalize(source.excerpt).includes(normalize(x.quote));
  }).map(x => `원문 발췌와 인용문이 일치하지 않음: ${x.ref} · ${x.statement}`);
  const questions = data.questions.map(x => ({
    id: requireRef(questionIds, x.ref), text: x.text, provenance: x.provenance,
    sourceIds: x.sourceRefs.map(ref => requireRef(sourceIds, ref)),
    ...('situation' in x ? { situation: x.situation, need: x.need, painPoint: x.painPoint, decisionCriteria: x.decisionCriteria } : {}),
  }));
  const researchInsights: Project['researchInsights'] = data.contract === 'alc.research.v2' ? {
    questionClusters: data.questionClusters.map(x => ({ label: x.label, questionIds: x.questionRefs.map(ref => requireRef(questionIds, ref)) })),
    unmetNeeds: data.unmetNeeds.map(x => ({ situation: x.situation, need: x.need, provenance: x.provenance,
      sourceIds: x.sourceRefs.map(ref => requireRef(sourceIds, ref)) })),
    productCandidates: data.productCandidates,
    existingContent: data.existingContent,
  } : { questionClusters: [], unmetNeeds: [], productCandidates: [], existingContent: [] };
  const unrecognizedVerdicts = data.comparisons.filter(x => ![
    'advantage', 'common', 'unknown', 'weakness', 'own_advantage', 'competitor_advantage',
    'manufacturer_claim_only', 'conditional',
  ].includes(x.verdict)).map(x => `경쟁 비교 ${x.ref}의 판단 표기는 별도로 해석하지 않았습니다. 원문과 조건을 확인해 주세요.`);
  const comparisons = data.comparisons.map(x => ({
    id: requireRef(comparisonIds, x.ref), competitor: x.competitor, criterion: x.criterion,
    ownClaimIds: x.ownClaimRefs.map(ref => requireRef(claimIds, ref)),
    otherClaimIds: x.otherClaimRefs.map(ref => requireRef(claimIds, ref)),
    // An external response cannot certify matching models, dates or test conditions.
    comparable: false, verdict: 'unknown' as const,
    reason: `${x.reason} (외부 조사 제안: 양쪽 원문·모델·조건 확인 전)`,
  }));
  const recommendations = data.recommendations.map(x => ({
    id: crypto.randomUUID(), situation: x.situation, reason: x.reason,
    claimIds: x.claimRefs.map(ref => requireRef(claimIds, ref)),
    comparisonIds: x.comparisonRefs.map(ref => requireRef(comparisonIds, ref)), limitation: x.limitation,
  }));
  const documents = Object.fromEntries(Object.entries(project.documents).map(([channel, document]) => [channel, document && { ...document, status: 'stale' }]));
  return {
    ...project, sources: [...project.sources, ...sources], claims: [...project.claims, ...claims],
    analysisHistory: project.questions.length || project.comparisons.length || project.recommendations.length ?
      [...project.analysisHistory, { inputRevision: project.inputRevision, evidenceRevision: project.evidenceRevision,
        at: now, questions: project.questions, comparisons: project.comparisons,
        recommendations: project.recommendations, researchInsights: project.researchInsights }] : project.analysisHistory,
    questions, comparisons, recommendations, researchInsights, missingEvidence: [...data.missingEvidence, ...unmatchedQuotes, ...unrecognizedVerdicts],
    importReceipts: [...project.importReceipts, { requestId: data.requestId, contract: data.contract, responseHash: fingerprint(response), at: now }],
    documents: documents as Project['documents'], evidenceRevision: project.evidenceRevision + 1,
    manualResearchRequestId: null, manualContentRequestId: null,
    migrationNote: [
      confirmSameEntity ? `사용자가 같은 대상으로 확인한 조사 이름: ${data.entity.name} (현재 작업: ${project.name}). 이 확인은 출처·주장의 검증을 뜻하지 않습니다.` : '',
      data.missingEvidence.length || unmatchedQuotes.length || unrecognizedVerdicts.length ? `추가 확인: ${[...data.missingEvidence, ...unmatchedQuotes, ...unrecognizedVerdicts].join(' · ')}` : '',
    ].filter(Boolean).join('\n') || project.migrationNote,
  };
}

export function verifyClaim(project: Project, claimId: string): Project {
  const claim = project.claims.find(c => c.id === claimId);
  const source = project.sources.find(s => s.id === claim?.sourceId);
  if (claim && claim.target !== 'competitor' && project.model && !claim.subject.includes(project.model)) {
    throw new ImportError('이 주장이 현재 모델에 관한 것인지 확인되지 않았어요. 모델명이 포함된 원문과 조사 응답을 보완해 주세요.');
  }
  if (!claim || !source || source.origin === 'external_response' || !claim.quote || !normalize(source.body).includes(normalize(claim.quote))) {
    throw new ImportError('원문에서 해당 인용 구간을 찾지 못했습니다. 근거를 보완해 주세요.');
  }
  if (claim.target === 'unresolved' || (claim.target === 'competitor' && (!claim.subject || claim.subject === project.name))) {
    throw new ImportError('이 주장이 어느 제품에 관한 것인지 먼저 확인해 주세요.');
  }
  if (claim.target !== 'competitor' && !normalize(claim.subject).includes(normalize(project.name))) {
    throw new ImportError('현재 대상과 다른 이름의 주장입니다. 조사 응답에서 정확한 대상명을 확인해 주세요.');
  }
  const claims = project.claims.map(c => c.id === claimId ? { ...c, status: 'supported' as const, reviewedBy: 'human' as const, review: { sourceHash: source.hash, quote: c.quote, at: new Date().toISOString(), method: 'human' as const } } : c);
  return { ...project, claims, evidenceRevision: project.evidenceRevision + 1,
    manualResearchRequestId: null, manualContentRequestId: null,
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'] };
}

export function attachOriginalText(project: Project, sourceId: string, body: string, publicationAllowed: boolean): Project {
  const source = project.sources.find(s => s.id === sourceId);
  if (!source || !body.trim()) throw new ImportError('원문을 붙여넣어 주세요.');
  const related = project.claims.filter(c => c.sourceId === sourceId);
  const unmatched = related.filter(c => !c.quote || !normalize(body).includes(normalize(c.quote)));
  return { ...project,
    sources: project.sources.map(s => s.id === sourceId ? {
      ...s, body, excerpt: body.slice(0, 50000), origin: 'direct_input' as const,
      hash: fingerprint(body), publicationAllowed,
    } : s),
    claims: project.claims.map(c => c.sourceId === sourceId ? { ...c,
      status: unmatched.some(item => item.id === c.id) ? 'insufficient' as const : 'unreviewed' as const,
      reviewedBy: null, review: undefined } : c),
    missingEvidence: [...new Set([...project.missingEvidence, ...unmatched.map(c => `원문에서 인용을 찾지 못했습니다: ${c.statement}`)])],
    evidenceRevision: project.evidenceRevision + 1,
    manualResearchRequestId: null, manualContentRequestId: null,
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'],
  };
}

export function prepareContent(project: Project, requestedChannels = project.contentRequestChannels.length ? project.contentRequestChannels : project.selectedChannels): { project: Project; prompt: string } {
  const selected = requestedChannels.filter(c => project.selectedChannels.includes(c));
  if (!selected.length) throw new ImportError('작성할 채널을 선택해 주세요.');
  const requestId = project.manualContentRequestId && JSON.stringify(project.contentRequestChannels) === JSON.stringify(selected) ? project.manualContentRequestId : crypto.randomUUID();
  const brief = buildContentBrief(project, requestId, selected);
  const channelList = selected.map(channel => `${channel}(${channelNames[channel]})`).join(', ');
  const payload = JSON.stringify(brief, null, 2);
  if (payload.length > 90000) throw new ImportError('작성 요청문에 넣을 자료가 너무 깁니다. 근거와 질문을 나누어 선택해 주세요. 내용은 자동으로 잘라내지 않았습니다.');
  return {
    project: { ...project, manualContentRequestId: requestId, contentRequestChannels: selected },
    prompt: [
      `요청문 버전: ${promptVersion}; 입력 버전: ${project.inputRevision}; 근거 버전: ${project.evidenceRevision}`,
      ...koreanRules,
      ...selected.map(channel => `${channel}: ${channelRoles[channel].purpose} 구성: ${channelRoles[channel].structure} 주의: ${channelRoles[channel].guard}`),
      '다음 목적에 맞춰 한국어 콘텐츠를 채널별로 실제 본문까지 작성해 주세요. 없는 수치·인증·경쟁 우위·후기·인용문·영상 타임코드를 만들지 마세요.',
      `requestId: ${requestId}; 대상: ${project.name}; 모델: ${project.model || '미지정'}; 목적: ${project.objective}; 고객: ${project.audienceUndecided ? '아직 미정' : project.audience}`,
      `선택 채널: ${channelList}`,
      `인사이트와 근거의 공통 계약(alc.brief.v1):\n${payload}`,
      '위 feedback은 작성 방향입니다. 새로운 기능·수치·비교 우위·효능이 들어 있어도 allowedClaims에 없으면 사실로 쓰지 말고 unresolvedItems에 추가해 주세요.',
      'comparisons의 비교 미확인은 경쟁 제품에 해당 기능이 없다는 뜻이 아닙니다. 확인된 비교만 조건과 함께 공개 본문에 적으세요.',
      '블로그와 상세페이지는 questions 중 우선 질문에 실제로 답하세요. 제목·목차·확인 요청만 적지 마세요. 자료 없는 사실은 작성 메모와 unresolvedItems에 두세요.',
      '광고카피는 역할이 다른 세 안마다 헤드라인·보조 문구·행동 유도를 씁니다. 상세페이지는 고객 문제·기능과 조건·FAQ 실제 답·구매 안내까지 씁니다. 보도자료는 발표 자료가 없으면 발표 내용 확인 전 초안입니다.',
      '유튜브는 제목 후보 3안에 지정된 prefix와 공식 제품명을 적용하고 “제품명 | 영상 설명과 핵심 기능 (편명은 선택)”으로 씁니다. 제품군이나 prefix가 미확정이면 지어내지 말고 확인 항목으로 남깁니다. 첫 문단에는 실제 영상 맥락과 공식 URL, 뒤에는 기능·모델 조건, 답 가능한 FAQ를 씁니다.',
      '영상·대본이 없으면 유튜브는 제작 전 초안, 실제 후기·녹취가 없으면 후기는 촬영 가이드, 발표 정보가 없으면 보도자료는 발표 전 초안으로 표시하세요.',
      `JSON만 반환하세요. 형식: {"contract":"alc.content.v2","requestId":"${requestId}","inputRevision":${project.inputRevision},"evidenceRevision":${project.evidenceRevision},"insightRevision":${project.insight.revision},"documents":[{"channel":"ad_copy","blocks":[{"kind":"heading|paragraph|bullet|cta|note","section":"역할별 구분","text":"실제 본문","claimRefs":["실제 허용된 주장 ID"],"questionRefs":["brief 안의 질문 ID"]}]}],"unresolvedItems":[]}.`,
      '선택 채널만 각각 한 번씩 반환하고, 빈 채널은 그대로 누락하며 unresolvedItems에 이유를 적으세요. 사실 주장은 해당 claimRefs와 조건을 본문에 포함하세요. 새 사실을 만들지 마세요.',
      'JSON이 불가능한 경우만 정확한 Markdown 형식으로 보내세요: # alc.content.v1 / requestId: 위 ID / ## ad_copy 등 채널 ID 아래 - heading | 제목 | 또는 - paragraph | 본문 | 허용 주장 ID. 나머지 채널도 각각 ## 채널 ID로 구분하세요.',
    ].join('\n\n'),
  };
}

function blockHash(block: ChannelDocument['blocks'][number]): string {
  return fingerprint(JSON.stringify([block.kind, block.text, block.claimRefs]));
}

export function reviewBlock(project: Project, channel: typeof channels[number], blockId: string): Project {
  const document = project.documents[channel];
  const block = document?.blocks.find(item => item.id === blockId);
  if (!document || !block || block.kind === 'note' || document.evidenceRevision !== project.evidenceRevision) {
    throw new ImportError('문구와 근거의 현재 버전을 먼저 확인해 주세요.');
  }
  const checked = validateDocument(project, document);
  if (checked.status === 'blocked') throw new ImportError('이 문서에 근거가 없거나 조건이 빠진 문장이 있습니다. 먼저 고쳐 주세요.');
  return { ...project, documents: { ...project.documents, [channel]: {
    ...document, status: 'needs_review', validationHash: null,
    reviewedBlocks: { ...document.reviewedBlocks, [blockId]: blockHash(block) },
  } } };
}

export function importContent(project: Project, response: string): Project {
  const raw = parseResponse(response);
  const v2 = !!raw && typeof raw === 'object' && 'contract' in raw && raw.contract === 'alc.content.v2';
  const parsed = (v2 ? z.object({ contract: z.literal('alc.content.v2'), requestId: z.string().min(1),
    inputRevision: z.number().int(), evidenceRevision: z.number().int(), insightRevision: z.number().int(),
    documents: z.array(z.unknown()), unresolvedItems: z.array(z.string()).default([]) }) :
    z.object({ contract: z.literal('alc.content.v1'), requestId: z.string().min(1),
      documents: z.array(z.unknown()), unresolvedItems: z.array(z.string()).default([]) })).safeParse(raw);
  if (!parsed.success) throw new ImportError(`채널 응답에서 필요한 항목을 찾지 못했어요: ${parsed.error.issues[0]?.path.join('.') || '형식'}`);
  const data = parsed.data;
  const priorReceipt = project.importReceipts.find(r => r.requestId === data.requestId && r.contract === data.contract);
  if (priorReceipt?.responseHash === fingerprint(response)) return project;
  if (priorReceipt) throw new ImportError('이미 가져온 요청에 다른 응답이 들어왔습니다. 새 작성 요청문을 만들어 주세요.');
  if (!project.manualContentRequestId || data.requestId !== project.manualContentRequestId) throw new ImportError('현재 프로젝트의 작성 응답이 아닙니다.');
  if (v2 && 'inputRevision' in data && (data.inputRevision !== project.inputRevision ||
      data.evidenceRevision !== project.evidenceRevision || data.insightRevision !== project.insight.revision)) {
    throw new ImportError('이전 입력이나 인사이트에 대한 응답입니다. 현재 문구를 덮어쓰지 않고 원문을 보관했습니다.');
  }
  if (!data.documents.length) throw new ImportError('응답에 작성된 채널이 없습니다. 원문을 보존하고 다시 요청해 주세요.');
  const seen = new Set<string>();
  const documents = { ...project.documents };
  const documentHistory = { ...project.documentHistory };
  const documentProposals = { ...project.documentProposals };
  const requested = project.contentRequestChannels.length ? project.contentRequestChannels : project.selectedChannels;
  const rejected: string[] = [];
  for (const rawEntry of data.documents) {
    const valid = (v2 ? contentV2Schema.shape.documents.element : contentImportSchema.shape.documents.element).safeParse(rawEntry);
    if (!valid.success) { rejected.push('응답의 한 채널에서 필요한 항목을 찾지 못함'); continue; }
    const entry = valid.data;
    if (!requested.includes(entry.channel) || seen.has(entry.channel)) { rejected.push(`${channelNames[entry.channel]}: 선택하지 않았거나 중복된 채널`); continue; }
    const missingRef = entry.blocks.flatMap(block => block.claimRefs).find(ref => !project.claims.some(c => c.id === ref));
    if (missingRef) { rejected.push(`${channelNames[entry.channel]}: 없는 근거 번호 ${missingRef}`); continue; }
    if (v2 && entry.blocks.some(block => 'questionRefs' in block && Array.isArray(block.questionRefs) &&
        block.questionRefs.some((ref: string) => !project.questions.some(q => q.id === ref)))) {
      rejected.push(`${channelNames[entry.channel]}: 없는 고객 질문 번호`); continue;
    }
    seen.add(entry.channel);
    const prior = documents[entry.channel];
    
    const candidate: ChannelDocument = {
      id: prior?.id || crypto.randomUUID(), channel: entry.channel,
      blocks: entry.blocks.map(b => ({ ...b, id: crypto.randomUUID() })),
      revision: (prior?.revision || 0) + 1, baseRevision: prior?.revision, inputRevision: project.inputRevision, evidenceRevision: project.evidenceRevision,
      insightRevision: project.insight.revision, requestId: data.requestId,
      validationHash: null, status: 'needs_review', warnings: [], updatedAt: new Date().toISOString(),
      reviewedBlocks: {},
    };
    if (prior) documentProposals[entry.channel] = validateDocument(project, candidate);
    else documents[entry.channel] = validateDocument(project, candidate);
  }
  if (!seen.size) throw new ImportError(`가져올 수 있는 채널이 없습니다. ${rejected.join(' · ') || '응답을 확인해 주세요.'}`);
  const missing = requested.filter(channel => !seen.has(channel)).map(channel => `${channelNames[channel]}: 응답에서 찾지 못함`);
  return { ...project, documents, documentHistory, documentProposals, manualContentRequestId: null,
    importReceipts: [...project.importReceipts, { requestId: data.requestId, contract: data.contract, responseHash: fingerprint(response), at: new Date().toISOString() }],
    migrationNote: [...data.unresolvedItems, ...rejected, ...missing].length ? `작성 후 확인: ${[...data.unresolvedItems, ...rejected, ...missing].join(' · ')}` : project.migrationNote };
}

export function importFreeformDraft(project: Project, channel: typeof channels[number], response: string): Project {
  const body = response.trim();
  if (!project.selectedChannels.includes(channel) || !body || body.length > 25000) {
    throw new ImportError('보관할 채널과 2만 5천 자 이하의 본문을 확인해 주세요.');
  }
  const previous = project.documents[channel];
  const draft = validateDocument(project, {
    id: previous?.id || crypto.randomUUID(), channel,
    blocks: [{ id: crypto.randomUUID(), kind: 'paragraph', text: body, claimRefs: [] }],
    revision: (previous?.revision || 0) + 1, evidenceRevision: project.evidenceRevision,
    reviewedBlocks: {}, validationHash: null, status: 'needs_review', warnings: [], updatedAt: new Date().toISOString(),
    baseRevision: previous?.revision, inputRevision: project.inputRevision,
  });
  return { ...project,
    documents: previous ? project.documents : { ...project.documents, [channel]: draft },
    documentProposals: previous ? { ...project.documentProposals, [channel]: draft } : project.documentProposals,
    migrationNote: '자유 형식 응답을 선택한 채널의 검토용 초안으로 보관했습니다. 근거 번호는 연결되지 않았습니다. 출처와 사실을 다시 확인해 주세요.',
  };
}

export function checkCurrentDocument(project: Project, channel: typeof channels[number]): Project {
  const doc = project.documents[channel];
  if (!doc) throw new ImportError('확인할 문구가 없습니다.');
  const next = validateDocument(project, { ...doc, evidenceRevision: project.evidenceRevision, inputRevision: project.inputRevision,
    revision: doc.revision + 1, reviewedBlocks: {}, updatedAt: new Date().toISOString() });
  return { ...project, documents: { ...project.documents, [channel]: next } };
}

export function editDocument(project: Project, channel: typeof channels[number], blocks: ChannelDocument['blocks']): Project {
  const prior = project.documents[channel];
  if (!prior) throw new ImportError('이 채널의 문서를 찾지 못했습니다.');
  const next = validateDocument(project, {
    ...prior, blocks, reviewedBlocks: {}, revision: prior.revision + 1, status: 'stale', validationHash: null, updatedAt: new Date().toISOString(),
  });
  return { ...project, documents: { ...project.documents, [channel]: { ...next, status: 'stale' } },
    documentHistory: { ...project.documentHistory, [channel]: [...(project.documentHistory[channel] || []), prior] } };
}

export function updateDocumentText(project: Project, channel: typeof channels[number], blockId: string, text: string): Project {
  const prior = project.documents[channel];
  if (!prior || !prior.blocks.some(b => b.id === blockId)) throw new ImportError('수정할 문단을 찾지 못했어요.');
  if (text.length > 25000) throw new ImportError('한 문단은 2만 5천 자 이내로 작성해 주세요.');
  if (prior.blocks.find(b => b.id === blockId)?.text === text) return project;
  const changed = editDocument(project, channel, prior.blocks.map(b => b.id === blockId ? { ...b, text } : b));
  // Keep the version before this editing session. Do not create a full archive per keystroke.
  if (prior.status === 'stale') changed.documentHistory = project.documentHistory;
  return changed;
}

export function applyDocumentProposal(project: Project, channel: typeof channels[number], allowChanged = false): Project {
  const candidate = project.documentProposals[channel];
  const prior = project.documents[channel];
  if (!candidate || !prior) throw new ImportError('적용할 새 문구를 찾지 못했어요.');
  if (candidate.evidenceRevision !== project.evidenceRevision || candidate.inputRevision !== project.inputRevision) throw new ImportError('입력이나 근거가 바뀐 뒤 도착한 문구입니다. 현재 자료로 다시 요청해 주세요.');
  if (candidate.baseRevision !== prior.revision && !allowChanged) throw new ImportError('새 문구를 요청한 뒤 기존 본문을 수정했습니다. 두 버전을 비교해 주세요.');
  const proposals = { ...project.documentProposals }; delete proposals[channel];
  const next = validateDocument(project, { ...candidate, revision: prior.revision + 1, updatedAt: new Date().toISOString() });
  return { ...project, documentProposals: proposals, documents: { ...project.documents, [channel]: next },
    documentHistory: { ...project.documentHistory, [channel]: [...(project.documentHistory[channel] || []), prior] } };
}

export function rejectClaim(project: Project, claimId: string, status: 'contradicted' | 'insufficient'): Project {
  return { ...project, evidenceRevision: project.evidenceRevision + 1,
    claims: project.claims.map(c => c.id === claimId ? { ...c, status, reviewedBy: 'human' as const, review: undefined } : c),
    manualResearchRequestId: null, manualContentRequestId: null,
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'] };
}

export function confirmComparison(project: Project, comparisonId: string, input: { verdict: 'advantage' | 'common' | 'weakness'; conditions: string; asOf: string; reason: string }): Project {
  const comparison = project.comparisons.find(c => c.id === comparisonId);
  if (!comparison || !comparison.ownClaimIds.length || !comparison.otherClaimIds.length ||
      [...comparison.ownClaimIds, ...comparison.otherClaimIds].some(id => {
        const claim = project.claims.find(c => c.id === id);
        return !claim || claim.status !== 'supported' || !project.sources.some(s => s.id === claim.sourceId && s.origin !== 'external_response' && s.publicationAllowed);
      })) throw new ImportError('자사와 경쟁 제품 양쪽의 원문·주장을 먼저 확인해 주세요.');
  if (!input.conditions.trim() || !input.reason.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.asOf) || Number.isNaN(Date.parse(input.asOf))) throw new ImportError('비교 조건·기준 날짜·판단 이유를 적어 주세요.');
  return { ...project,
    comparisons: project.comparisons.map(c => c.id === comparisonId ? { ...c, comparable: true, verdict: input.verdict,
      reason: input.reason.trim(), review: { conditions: input.conditions.trim(), asOf: input.asOf, at: new Date().toISOString(), evidenceRevision: project.evidenceRevision } } : c),
    manualContentRequestId: null,
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'] };
}

export function restoreDocumentVersion(project: Project, channel: typeof channels[number], previousId: string, revision: number): Project {
  const previous = project.documentHistory[channel]?.find(doc => doc.id === previousId && doc.revision === revision);
  const current = project.documents[channel];
  if (!previous || !current) throw new ImportError('복원할 이전 버전을 찾지 못했습니다.');
  const restored = validateDocument(project, { ...previous, id: current.id, revision: current.revision + 1,
    evidenceRevision: project.evidenceRevision, reviewedBlocks: {}, status: 'stale', validationHash: null, updatedAt: new Date().toISOString() });
  return { ...project, documents: { ...project.documents, [channel]: { ...restored, status: 'stale' } },
    documentHistory: { ...project.documentHistory, [channel]: [...(project.documentHistory[channel] || []), current] } };
}

export function reviewDocument(project: Project, channel: typeof channels[number]): Project {
  const document = project.documents[channel];
  if (!document || document.evidenceRevision !== project.evidenceRevision) throw new ImportError('근거가 바뀌었습니다. 이 채널을 다시 작성하거나 확인해 주세요.');
  if (!insightCurrent(project) || document.insightRevision !== project.insight.revision) throw new ImportError('현재 인사이트와 다른 문구입니다. 새 방향으로 다시 작성해 주세요.');
  const checked = validateDocument(project, document);
  if (checked.status === 'blocked') throw new ImportError('확인되지 않은 사실이나 자료가 남아 있어 최종본으로 표시할 수 없습니다.');
  if (checked.status === 'outline') throw new ImportError('자료 보완용 구성안은 최종 원고로 표시할 수 없습니다.');
  const quality = channelCompleteness(project, checked);
  if (!quality.complete) throw new ImportError(quality.missing[0]);
  if ((channel === 'review_video' && !project.sources.some(s => s.sourceType === 'review')) ||
      (channel === 'press_release' && !project.sources.some(s => /발표|출시/.test(s.title)))) {
    throw new ImportError('실제 후기 또는 발표 정보를 확인할 때까지 검토용 초안으로만 사용할 수 있습니다.');
  }
  const final = { ...checked, status: 'ready' as const, validationHash: fingerprint(JSON.stringify(checked.blocks) + project.evidenceRevision), validation: checked.validation && { ...checked.validation, semanticMethod: 'human' as const } };
  return { ...project, documents: { ...project.documents, [channel]: final } };
}
