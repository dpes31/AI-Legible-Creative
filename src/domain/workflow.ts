import {
  contentImportSchema, researchImportSchema, channels, channelNames,
  type ChannelDocument, type Claim, type Project, type ResearchImport, type Source,
} from './schema';
import { z } from 'zod';
import { assessRecommendation } from './analysis/recommendations';
import { channelRoles, researchLimits } from './analysis/strategy';
import { koreanRules, promptVersion, researchRules } from '@/lib/prompts/rules';
import { fingerprint, normalize } from './text';
import { validateDocument } from './validation/document';
export { fingerprint } from './text';
export { validateDocument } from './validation/document';

export class ImportError extends Error {}

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
      `대상: ${project.name} (${project.kind}); 모델: ${project.model || '미지정'}; 설명: ${project.description || '제공되지 않음'}`,
      `공식 링크: ${project.officialUrl || '제공되지 않음'}`,
      `목적: ${project.objective}; 고객 상황: ${project.audienceUndecided ? '아직 정하지 않음' : project.audience}`,
      `외부 AI 전달을 허용한 자료: ${sharedText || '없음'}`,
      '자사 사실, 고객의 실제 질문과 추정 질문, 같은 조건의 경쟁 제품, 반대 근거와 부족한 자료를 구분해 주세요.',
      '공식 자료 기재와 독립 시험 결과를 구별하고, 찾지 못한 경쟁사 자료를 기능 부재로 해석하지 마세요.',
      'JSON만 반환하세요. 필수 항목은 contract, requestId, entity, sources, claims, questions, comparisons, recommendations, missingEvidence입니다.',
      `contract는 alc.research.v1, requestId는 ${requestId}, entity는 {"name":"${project.name.replaceAll('"', '\\"')}"}입니다.`,
      'sources 각 항목: {"ref":"S1","title":"문서명","url":null,"excerpt":"실제 확인한 원문","sourceType":"official|test|independent|review|user"}.',
      'claims 각 항목: {"ref":"C1","statement":"검증할 주장","sourceRef":"S1","quote":"원문의 정확한 구간","conditions":"조건","subject":"정확한 대상·모델"}. 모델을 지정한 제품은 subject에도 해당 모델명을 넣으세요.',
      'questions 각 항목: {"ref":"Q1","text":"고객 질문","provenance":"observed|reconstructed|hypothesis","sourceRefs":["S1"]}.',
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

export function importResearch(project: Project, response: string): Project {
  const parsed = researchImportSchema.safeParse(parseResponse(response));
  if (!parsed.success) throw new ImportError(`조사 응답에서 필요한 항목을 찾지 못했어요: ${parsed.error.issues[0]?.path.join('.') || '형식'}`);
  const data: ResearchImport = parsed.data;
  const priorReceipt = project.importReceipts.find(r => r.requestId === data.requestId && r.contract === data.contract);
  if (priorReceipt?.responseHash === fingerprint(response)) return project;
  if (priorReceipt) throw new ImportError('이미 가져온 요청에 다른 응답이 들어왔습니다. 새 조사 요청문을 만들어 주세요.');
  if (data.sources.length > researchLimits.sources || data.questions.length > researchLimits.questions || new Set(data.comparisons.map(c => c.competitor)).size > researchLimits.competitors) throw new ImportError('조사 범위를 넘었습니다. 자료 20개·질문 12개·경쟁 후보 3개 이내로 정리해 주세요. 원문은 그대로 남아 있습니다.');
  if (!project.manualResearchRequestId || data.requestId !== project.manualResearchRequestId) throw new ImportError('현재 프로젝트의 조사 응답이 아닙니다. 요청 ID를 확인해 주세요.');
  if (normalize(data.entity.name).toLowerCase() !== normalize(project.name).toLowerCase()) throw new ImportError('응답의 제품명이 현재 프로젝트와 다릅니다.');
  if (!data.sources.length && !data.claims.length && !data.recommendations.length) throw new ImportError('응답에 조사 자료가 없습니다. 공식 자료나 제품 설명을 추가해 주세요.');
  [data.sources, data.claims, data.questions, data.comparisons, data.recommendations].forEach(uniqueRefs);
  const now = new Date().toISOString();
  const sourceIds = new Map(data.sources.map(x => [x.ref, crypto.randomUUID()]));
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
    duplicateGroupId: fingerprint(normalize(x.excerpt)), hash: fingerprint(x.excerpt),
  }));
  const claims: Claim[] = data.claims.map(x => {
    const sourceId = x.sourceRef ? requireRef(sourceIds, x.sourceRef) : null;
    return {
      id: requireRef(claimIds, x.ref), projectId: project.id, statement: x.statement,
      sourceId, quote: x.quote, conditions: x.conditions, subject: x.subject || project.name,
      status: 'unreviewed', reviewedBy: null,
      target: data.comparisons.some(c => c.otherClaimRefs.includes(x.ref)) ? 'competitor' : 'own',
    };
  });
  const questions = data.questions.map(x => ({
    id: crypto.randomUUID(), text: x.text, provenance: x.provenance,
    sourceIds: x.sourceRefs.map(ref => requireRef(sourceIds, ref)),
  }));
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
    questions, comparisons, recommendations, missingEvidence: data.missingEvidence,
    importReceipts: [...project.importReceipts, { requestId: data.requestId, contract: data.contract, responseHash: fingerprint(response), at: now }],
    documents: documents as Project['documents'], evidenceRevision: project.evidenceRevision + 1,
    manualResearchRequestId: null, manualContentRequestId: null,
    migrationNote: data.missingEvidence.length ? `추가 확인: ${data.missingEvidence.join(' · ')}` : project.migrationNote,
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
  if (related.some(c => c.quote && !normalize(body).includes(normalize(c.quote)))) {
    throw new ImportError('외부 AI가 제시한 인용문을 원문에서 찾지 못했습니다. 주장과 출처를 다시 확인해 주세요.');
  }
  return { ...project,
    sources: project.sources.map(s => s.id === sourceId ? {
      ...s, body, excerpt: body.slice(0, 50000), origin: 'direct_input' as const,
      hash: fingerprint(body), publicationAllowed,
    } : s),
    claims: project.claims.map(c => c.sourceId === sourceId ? { ...c, status: 'unreviewed' as const, reviewedBy: null, review: undefined } : c),
    evidenceRevision: project.evidenceRevision + 1,
    manualResearchRequestId: null, manualContentRequestId: null,
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'],
  };
}

export function prepareContent(project: Project, requestedChannels = project.contentRequestChannels.length ? project.contentRequestChannels : project.selectedChannels): { project: Project; prompt: string } {
  const selected = requestedChannels.filter(c => project.selectedChannels.includes(c));
  if (!selected.length) throw new ImportError('작성할 채널을 선택해 주세요.');
  const requestId = project.manualContentRequestId && JSON.stringify(project.contentRequestChannels) === JSON.stringify(selected) ? project.manualContentRequestId : crypto.randomUUID();
  const approved = project.claims.filter(c => c.target !== 'competitor' && c.target !== 'unresolved' && c.status === 'supported' && project.sources.some(s =>
    s.id === c.sourceId && s.publicationAllowed && s.externalAiAllowed));
  const supportedReasons = project.recommendations.filter(reason => assessRecommendation(project, reason).usable && reason.claimIds.every(id => approved.some(c => c.id === id)));
  const channelList = selected.map(channel => `${channel}(${channelNames[channel]})`).join(', ');
  return {
    project: { ...project, manualContentRequestId: requestId, contentRequestChannels: selected },
    prompt: [
      `요청문 버전: ${promptVersion}; 입력 버전: ${project.inputRevision}; 근거 버전: ${project.evidenceRevision}`,
      ...koreanRules,
      ...selected.map(channel => `${channel}: ${channelRoles[channel].purpose} 구성: ${channelRoles[channel].structure} 주의: ${channelRoles[channel].guard}`),
      '다음 목적에 맞춰 한국어 콘텐츠를 채널별로 작성해 주세요. 없는 수치·인증·경쟁 우위·후기·인용문·영상 타임코드를 만들지 마세요.',
      `requestId: ${requestId}; 대상: ${project.name}; 모델: ${project.model || '미지정'}; 목적: ${project.objective}; 고객: ${project.audienceUndecided ? '아직 미정' : project.audience}`,
      `선택 채널: ${channelList}`,
      `사용 가능한 주장과 조건: ${approved.map(c => `[${c.id}] ${c.statement}${c.conditions ? ` (조건: ${c.conditions})` : ''}`).join('\n') || '확인된 사실 없음. 사실을 추가하지 말고 자료 보완용 구성안만 작성하세요.'}`,
      `근거가 연결된 선택 이유 후보(고객 적합성은 여전히 검토 필요): ${supportedReasons.map(r => `${r.reason} / 한계: ${r.limitation}`).join('; ') || '확인한 선택 이유 없음. 경쟁 우위를 주장하지 마세요.'}`,
      '광고카피·상세페이지·보도자료·유튜브 설명·블로그·후기 영상 핵심 문구는 서로 다른 역할의 문서로 작성하세요.',
      '광고카피: 헤드라인·보조 문구·행동 유도 3안. 상세페이지: 첫 화면·선택 이유·사용 조건·FAQ. 보도자료: 확인된 발표 내용만 첫 문단과 본문에. 유튜브: 제목 후보·첫 문단·공식 링크. 블로그: 고객 질문에 바로 답하고 상황별 선택 기준. 후기 영상: 실제 발언이 없다면 인터뷰 질문과 촬영 장면만.',
      '영상·대본이 없으면 유튜브는 제작 전 초안, 실제 후기·녹취가 없으면 후기는 촬영 가이드, 발표 정보가 없으면 보도자료는 발표 전 초안으로 표시하세요.',
      'JSON만 반환하세요. 형식: {"contract":"alc.content.v1","requestId":"위 ID","documents":[{"channel":"ad_copy","blocks":[{"kind":"heading|paragraph|bullet|cta|note","text":"문장","claimRefs":["실제 허용된 주장 ID"]}]}],"unresolvedItems":[]}.',
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
  const parsed = z.object({ contract: z.literal('alc.content.v1'), requestId: z.string().min(1),
    documents: z.array(z.unknown()), unresolvedItems: z.array(z.string()).default([]) }).safeParse(parseResponse(response));
  if (!parsed.success) throw new ImportError(`채널 응답에서 필요한 항목을 찾지 못했어요: ${parsed.error.issues[0]?.path.join('.') || '형식'}`);
  const data = parsed.data;
  const priorReceipt = project.importReceipts.find(r => r.requestId === data.requestId && r.contract === data.contract);
  if (priorReceipt?.responseHash === fingerprint(response)) return project;
  if (priorReceipt) throw new ImportError('이미 가져온 요청에 다른 응답이 들어왔습니다. 새 작성 요청문을 만들어 주세요.');
  if (!project.manualContentRequestId || data.requestId !== project.manualContentRequestId) throw new ImportError('현재 프로젝트의 작성 응답이 아닙니다.');
  if (!data.documents.length) throw new ImportError('응답에 작성된 채널이 없습니다. 원문을 보존하고 다시 요청해 주세요.');
  const seen = new Set<string>();
  const documents = { ...project.documents };
  const documentHistory = { ...project.documentHistory };
  const documentProposals = { ...project.documentProposals };
  const requested = project.contentRequestChannels.length ? project.contentRequestChannels : project.selectedChannels;
  const rejected: string[] = [];
  for (const rawEntry of data.documents) {
    const valid = contentImportSchema.shape.documents.element.safeParse(rawEntry);
    if (!valid.success) { rejected.push('응답의 한 채널에서 필요한 항목을 찾지 못함'); continue; }
    const entry = valid.data;
    if (!requested.includes(entry.channel) || seen.has(entry.channel)) { rejected.push(`${channelNames[entry.channel]}: 선택하지 않았거나 중복된 채널`); continue; }
    const missingRef = entry.blocks.flatMap(block => block.claimRefs).find(ref => !project.claims.some(c => c.id === ref));
    if (missingRef) { rejected.push(`${channelNames[entry.channel]}: 없는 근거 번호 ${missingRef}`); continue; }
    seen.add(entry.channel);
    const prior = documents[entry.channel];
    
    const candidate: ChannelDocument = {
      id: prior?.id || crypto.randomUUID(), channel: entry.channel,
      blocks: entry.blocks.map(b => ({ ...b, id: crypto.randomUUID() })),
      revision: (prior?.revision || 0) + 1, baseRevision: prior?.revision, inputRevision: project.inputRevision, evidenceRevision: project.evidenceRevision,
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
  const checked = validateDocument(project, document);
  if (checked.status === 'blocked') throw new ImportError('확인되지 않은 사실이나 자료가 남아 있어 최종본으로 표시할 수 없습니다.');
  if (checked.blocks.some(b => b.kind !== 'note' && document.reviewedBlocks[b.id] !== blockHash(b))) {
    throw new ImportError('공개 문장을 하나씩 읽고 근거 또는 사실이 없는 표현인지 확인해 주세요.');
  }
  if ((channel === 'review_video' && !project.sources.some(s => s.sourceType === 'review')) ||
      (channel === 'press_release' && !project.sources.some(s => /발표|출시/.test(s.title)))) {
    throw new ImportError('실제 후기 또는 발표 정보를 확인할 때까지 검토용 초안으로만 사용할 수 있습니다.');
  }
  const final = { ...checked, status: 'ready' as const, validationHash: fingerprint(JSON.stringify(checked.blocks) + project.evidenceRevision), validation: checked.validation && { ...checked.validation, semanticMethod: 'human' as const } };
  return { ...project, documents: { ...project.documents, [channel]: final } };
}
