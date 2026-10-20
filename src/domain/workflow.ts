import {
  contentImportSchema, researchImportSchema, channels, channelNames,
  type ChannelDocument, type Claim, type ContentImport, type Project, type ResearchImport, type Source,
} from './schema';

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
  const rows = (key: string) => (sections.get(key) || []).map(line => line.split(' | ').map(s => s.trim()));
  if (contract === 'alc.content.v1') {
    const documents = channels.flatMap(channel => sections.has(channel) ? [{ channel,
      blocks: rows(channel).map(([kind, body, refs = '']) => ({ kind, text: body, claimRefs: refs ? refs.split(',').map(s => s.trim()) : [] })),
    }] : []);
    return { contract, requestId, documents, unresolvedItems: (sections.get('unresolvedItems') || []) };
  }
  const entity = lines.find(line => /^entity\s*:/i.test(line))?.split(':').slice(1).join(':').trim();
  if (!entity) throw new ImportError('응답의 대상 이름을 찾지 못했어요.');
  return { contract, requestId, entity: { name: entity },
    sources: rows('sources').map(([ref, title, url = '', excerpt = '']) => ({ ref, title, url: url || null, excerpt, sourceType: 'user' })),
    claims: rows('claims').map(([ref, statement, sourceRef = '', quote = '']) => ({ ref, statement, sourceRef: sourceRef || null, quote, conditions: '', subject: entity })),
    questions: rows('questions').map(([ref, question]) => ({ ref, text: question, provenance: 'hypothesis', sourceRefs: [] })),
    comparisons: [], recommendations: [], missingEvidence: (sections.get('missingEvidence') || []),
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
      '다음 브랜드·제품을 조사해 주세요. 모르는 사실을 추측하거나 URL·수치·시험 조건을 만들지 마세요.',
      `요청 ID: ${requestId}`,
      `대상: ${project.name} (${project.kind}); 설명: ${project.description || '제공되지 않음'}`,
      `공식 링크: ${project.officialUrl || '제공되지 않음'}`,
      `목적: ${project.objective}; 고객 상황: ${project.audienceUndecided ? '아직 정하지 않음' : project.audience}`,
      `외부 AI 전달을 허용한 자료: ${sharedText || '없음'}`,
      '자사 사실, 고객의 실제 질문과 추정 질문, 같은 조건의 경쟁 제품, 반대 근거와 부족한 자료를 구분해 주세요.',
      '공식 자료 기재와 독립 시험 결과를 구별하고, 찾지 못한 경쟁사 자료를 기능 부재로 해석하지 마세요.',
      'JSON만 반환하세요. 필수 항목은 contract, requestId, entity, sources, claims, questions, comparisons, recommendations, missingEvidence입니다.',
      `contract는 alc.research.v1, requestId는 ${requestId}, entity는 {"name":"${project.name.replaceAll('"', '\\"')}"}입니다.`,
      'sources 각 항목: {"ref":"S1","title":"문서명","url":null,"excerpt":"실제 확인한 원문","sourceType":"official|test|independent|review|user"}.',
      'claims 각 항목: {"ref":"C1","statement":"검증할 주장","sourceRef":"S1","quote":"원문의 정확한 구간","conditions":"조건","subject":"대상"}.',
      'questions 각 항목: {"ref":"Q1","text":"고객 질문","provenance":"observed|reconstructed|hypothesis","sourceRefs":["S1"]}.',
      'comparisons 각 항목: {"ref":"K1","competitor":"대상","criterion":"비교 기준","ownClaimRefs":["C1"],"otherClaimRefs":[],"comparable":false,"verdict":"unknown","reason":"비교 자료 부족"}.',
      'recommendations 각 항목: {"ref":"R1","situation":"고객 상황","reason":"선택 이유","claimRefs":["C1"],"comparisonRefs":["K1"],"limitation":"적용되지 않는 경우"}.',
      '근거가 없으면 배열을 비워 두고 missingEvidence에 필요한 자료를 적으세요. 조사 결과의 verified/confidence 표시는 검증 완료가 아닙니다.',
      'JSON을 만들 수 없는 경우만 정확한 Markdown 형식으로 보내세요: # alc.research.v1 / requestId: 위 ID / entity: 대상명 / ## sources 아래 - S1 | 자료명 | URL 또는 빈칸 | 실제 원문 / ## claims 아래 - C1 | 주장 | S1 | 실제 인용 / ## questions 아래 - Q1 | 질문 / ## missingEvidence 아래 - 필요한 자료. 각 항목은 새 줄입니다.',
    ].join('\n\n'),
  };
}

function normalize(text: string) { return text.replace(/\s+/g, ' ').trim(); }
function uniqueRefs(items: { ref: string }[]) {
  const refs = items.map(x => x.ref);
  if (new Set(refs).size !== refs.length) throw new ImportError('응답의 자료 번호가 중복됩니다. 조사 요청문으로 다시 받아 주세요.');
}

export function importResearch(project: Project, response: string): Project {
  const parsed = researchImportSchema.safeParse(parseResponse(response));
  if (!parsed.success) throw new ImportError(`조사 응답에서 필요한 항목을 찾지 못했어요: ${parsed.error.issues[0]?.path.join('.') || '형식'}`);
  const data: ResearchImport = parsed.data;
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
    retrieval: 'user_provided', origin: 'external_response', publishedAt: null, collectedAt: now,
    externalAiAllowed: true, publicationAllowed: false,
    hash: fingerprint(x.excerpt),
  }));
  const claims: Claim[] = data.claims.map(x => {
    const sourceId = x.sourceRef ? requireRef(sourceIds, x.sourceRef) : null;
    return {
      id: requireRef(claimIds, x.ref), projectId: project.id, statement: x.statement,
      sourceId, quote: x.quote, conditions: x.conditions, subject: x.subject || project.name,
      status: 'unreviewed', reviewedBy: null,
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
    questions, comparisons, recommendations,
    documents: documents as Project['documents'], evidenceRevision: project.evidenceRevision + 1,
    manualResearchRequestId: null, manualContentRequestId: null,
    migrationNote: data.missingEvidence.length ? `추가 확인: ${data.missingEvidence.join(' · ')}` : project.migrationNote,
  };
}

export function verifyClaim(project: Project, claimId: string): Project {
  const claim = project.claims.find(c => c.id === claimId);
  const source = project.sources.find(s => s.id === claim?.sourceId);
  if (!claim || !source || source.origin === 'external_response' || !claim.quote || !normalize(source.body).includes(normalize(claim.quote))) {
    throw new ImportError('원문에서 해당 인용 구간을 찾지 못했습니다. 근거를 보완해 주세요.');
  }
  const claims = project.claims.map(c => c.id === claimId ? { ...c, status: 'supported' as const, reviewedBy: 'human' as const } : c);
  return { ...project, claims, evidenceRevision: project.evidenceRevision + 1,
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'] };
}

export function fingerprint(input: string): string {
  let hash = 2166136261;
  for (const char of input) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `fnv1a:${(hash >>> 0).toString(16)}`;
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
    evidenceRevision: project.evidenceRevision + 1,
    documents: Object.fromEntries(Object.entries(project.documents).map(([key, doc]) => [key, doc && { ...doc, status: 'stale' }])) as Project['documents'],
  };
}

export function prepareContent(project: Project): { project: Project; prompt: string } {
  const requestId = project.manualContentRequestId || crypto.randomUUID();
  const approved = project.claims.filter(c => c.status === 'supported' && project.sources.find(s => s.id === c.sourceId)?.publicationAllowed);
  const channelList = project.selectedChannels.map(channel => `${channel}(${channelNames[channel]})`).join(', ');
  return {
    project: { ...project, manualContentRequestId: requestId },
    prompt: [
      '다음 목적에 맞춰 한국어 콘텐츠를 채널별로 작성해 주세요. 없는 수치·인증·경쟁 우위·후기·인용문·영상 타임코드를 만들지 마세요.',
      `requestId: ${requestId}; 대상: ${project.name}; 목적: ${project.objective}; 고객: ${project.audienceUndecided ? '아직 미정' : project.audience}`,
      `선택 채널: ${channelList}`,
      `사용 가능한 주장과 조건: ${approved.map(c => `[${c.id}] ${c.statement}${c.conditions ? ` (조건: ${c.conditions})` : ''}`).join('\n') || '확인된 사실 없음. 사실을 추가하지 말고 자료 보완용 구성안만 작성하세요.'}`,
      `고객 선택 이유(자료 확인 상태를 유지): ${project.recommendations.map(r => `${r.reason} / 한계: ${r.limitation}`).join('; ') || '확인할 자료 없음'}`,
      '광고카피·상세페이지·보도자료·유튜브 설명·블로그·후기 영상 핵심 문구는 서로 다른 역할의 문서로 작성하세요.',
      '광고카피: 헤드라인·보조 문구·행동 유도 3안. 상세페이지: 첫 화면·선택 이유·사용 조건·FAQ. 보도자료: 확인된 발표 내용만 첫 문단과 본문에. 유튜브: 제목 후보·첫 문단·공식 링크. 블로그: 고객 질문에 바로 답하고 상황별 선택 기준. 후기 영상: 실제 발언이 없다면 인터뷰 질문과 촬영 장면만.',
      '영상·대본이 없으면 유튜브는 제작 전 초안, 실제 후기·녹취가 없으면 후기는 촬영 가이드, 발표 정보가 없으면 보도자료는 발표 전 초안으로 표시하세요.',
      'JSON만 반환하세요. 형식: {"contract":"alc.content.v1","requestId":"위 ID","documents":[{"channel":"ad_copy","blocks":[{"kind":"heading|paragraph|bullet|cta|note","text":"문장","claimRefs":["실제 허용된 주장 ID"]}]}],"unresolvedItems":[]}.',
      '선택 채널만 각각 한 번씩 반환하고, 빈 채널은 그대로 누락하며 unresolvedItems에 이유를 적으세요. 사실 주장은 해당 claimRefs와 조건을 본문에 포함하세요. 새 사실을 만들지 마세요.',
      'JSON이 불가능한 경우만 정확한 Markdown 형식으로 보내세요: # alc.content.v1 / requestId: 위 ID / ## ad_copy 등 채널 ID 아래 - heading | 제목 | 또는 - paragraph | 본문 | 허용 주장 ID. 나머지 채널도 각각 ## 채널 ID로 구분하세요.',
    ].join('\n\n'),
  };
}

const elevatedClaim = /\d+(?:[.,]\d+)?\s*(?:%|퍼센트|원|만원|시간|년|개월|배|건|위)|1\s*위|유일|최고|인증|효능|치료|완치|특허|입증/i;

export function validateDocument(project: Project, document: ChannelDocument): ChannelDocument {
  const warnings: string[] = [];
  let blocked = false;
  const claims = new Map(project.claims.map(c => [c.id, c]));
  if (!document.blocks.length || !document.blocks.some(b => b.text.trim())) warnings.push('본문이 비어 있습니다.');
  for (const block of document.blocks) {
    if (!block.text.trim() && block.kind !== 'note') warnings.push('빈 문단이 있습니다.');
    if (block.kind === 'note') continue;
    for (const ref of block.claimRefs) {
      const claim = claims.get(ref);
      if (!claim || claim.status !== 'supported') {
        warnings.push('확인되지 않은 주장이 문구에 연결되어 있습니다.'); blocked = true;
      } else if (claim.conditions && !block.text.includes(claim.conditions)) {
        warnings.push(`적용 조건이 문구에서 빠졌습니다: ${claim.conditions}`); blocked = true;
      }
    }
    if (elevatedClaim.test(block.text) && !block.claimRefs.length) {
      warnings.push('수치·인증·우위를 말하는 문구에 근거가 없습니다.'); blocked = true;
    }
    if (/\[[^\]]*(?:날짜|발언|입력|확인)[^\]]*\]/.test(block.text)) {
      warnings.push('확인하지 않은 자리표시자가 남아 있습니다.'); blocked = true;
    }
  }
  if (document.channel === 'review_video' && !project.sources.some(s => s.sourceType === 'review')) warnings.push('실제 후기가 없어 촬영 가이드로만 사용할 수 있습니다.');
  if (document.channel === 'youtube_description' && !project.sources.some(s => /대본|영상/.test(s.title))) warnings.push('실제 영상·대본을 확인하지 않은 제작 전 초안입니다.');
  if (document.channel === 'press_release') warnings.push('발표일·발표 내용과 인용문을 게시 전에 확인해 주세요.');
  if (!document.blocks.length) blocked = true;
  const status = blocked ? 'blocked' : project.claims.some(c => c.status === 'supported') ? 'needs_review' : 'outline';
  return { ...document, status, warnings: [...new Set(warnings)], validationHash: null };
}

export function importContent(project: Project, response: string): Project {
  const parsed = contentImportSchema.safeParse(parseResponse(response));
  if (!parsed.success) throw new ImportError(`채널 응답에서 필요한 항목을 찾지 못했어요: ${parsed.error.issues[0]?.path.join('.') || '형식'}`);
  const data: ContentImport = parsed.data;
  if (!project.manualContentRequestId || data.requestId !== project.manualContentRequestId) throw new ImportError('현재 프로젝트의 작성 응답이 아닙니다.');
  if (!data.documents.length) throw new ImportError('응답에 작성된 채널이 없습니다. 원문을 보존하고 다시 요청해 주세요.');
  const seen = new Set<string>();
  const documents = { ...project.documents };
  for (const entry of data.documents) {
    if (!project.selectedChannels.includes(entry.channel) || seen.has(entry.channel)) throw new ImportError('선택하지 않은 채널이나 중복된 채널이 포함되어 있습니다.');
    seen.add(entry.channel);
    for (const block of entry.blocks) for (const ref of block.claimRefs) {
      if (!project.claims.some(c => c.id === ref)) throw new ImportError(`없는 근거 번호가 문구에 포함되어 있습니다: ${ref}`);
    }
    const prior = documents[entry.channel];
    const candidate: ChannelDocument = {
      id: prior?.id || crypto.randomUUID(), channel: entry.channel,
      blocks: entry.blocks.map(b => ({ ...b, id: crypto.randomUUID() })),
      revision: (prior?.revision || 0) + 1, evidenceRevision: project.evidenceRevision,
      validationHash: null, status: 'needs_review', warnings: [], updatedAt: new Date().toISOString(),
    };
    documents[entry.channel] = validateDocument(project, candidate);
  }
  return { ...project, documents, manualContentRequestId: null,
    migrationNote: data.unresolvedItems.length ? `작성 후 확인: ${data.unresolvedItems.join(' · ')}` : project.migrationNote };
}

export function editDocument(project: Project, channel: typeof channels[number], blocks: ChannelDocument['blocks']): Project {
  const prior = project.documents[channel];
  if (!prior) throw new ImportError('이 채널의 문서를 찾지 못했습니다.');
  const next = validateDocument(project, {
    ...prior, blocks, revision: prior.revision + 1, status: 'stale', validationHash: null, updatedAt: new Date().toISOString(),
  });
  return { ...project, documents: { ...project.documents, [channel]: { ...next, status: 'stale' } } };
}

export function reviewDocument(project: Project, channel: typeof channels[number]): Project {
  const document = project.documents[channel];
  if (!document || document.evidenceRevision !== project.evidenceRevision) throw new ImportError('근거가 바뀌었습니다. 이 채널을 다시 작성하거나 확인해 주세요.');
  const checked = validateDocument(project, document);
  if (checked.status === 'blocked' || checked.status === 'outline') throw new ImportError('확인되지 않은 사실이나 자료가 남아 있어 최종본으로 표시할 수 없습니다.');
  if (checked.blocks.some(b => (b.kind === 'paragraph' || b.kind === 'bullet') && !b.claimRefs.length)) {
    throw new ImportError('근거가 연결되지 않은 본문이 있습니다. 검토용 초안으로 사용하거나 근거를 연결해 주세요.');
  }
  if ((channel === 'review_video' && !project.sources.some(s => s.sourceType === 'review')) ||
      (channel === 'press_release' && !project.sources.some(s => /발표|출시/.test(s.title)))) {
    throw new ImportError('실제 후기 또는 발표 정보를 확인할 때까지 검토용 초안으로만 사용할 수 있습니다.');
  }
  const final = { ...checked, status: 'ready' as const, validationHash: fingerprint(JSON.stringify(checked.blocks) + project.evidenceRevision) };
  return { ...project, documents: { ...project.documents, [channel]: final } };
}
