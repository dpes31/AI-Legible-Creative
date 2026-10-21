import { z } from 'zod';

export const channels = ['ad_copy', 'product_page', 'press_release', 'youtube_description', 'blog', 'review_video'] as const;
export type Channel = (typeof channels)[number];
export const channelNames: Record<Channel, string> = {
  ad_copy: '광고카피', product_page: '상세페이지', press_release: '보도자료',
  youtube_description: '유튜브 설명', blog: '블로그', review_video: '후기 영상 핵심 문구',
};
const id = z.string().min(1);
const shortText = z.string().trim().min(1).max(5000);
const webUrl = z.url().refine(value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, 'http 또는 https 링크만 사용할 수 있습니다.');
export const objectiveSchema = z.enum(['sales', 'feature', 'trust']);
export const categorySchema = z.enum(['berex', 'environment', 'wearable', 'other', 'unknown']);
export type ProductCategory = z.infer<typeof categorySchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export const objectiveNames: Record<Objective, string> = { sales: '구매·문의 늘리기', feature: '제품 특징 알리기', trust: '브랜드 신뢰 높이기' };
export const sourceSchema = z.object({
  id, projectId: id, title: shortText, url: webUrl.nullable(),
  excerpt: z.string().max(50000), body: z.string().max(300000),
  sourceType: z.enum(['official', 'test', 'independent', 'review', 'user']),
  retrieval: z.enum(['fetched', 'user_provided', 'failed', 'partial']),
  origin: z.enum(['direct_input', 'external_response', 'fetched']),
  publishedAt: z.string().nullable(), collectedAt: z.string().datetime(),
  externalAiAllowed: z.boolean(), publicationAllowed: z.boolean(),
  hash: id,
  publisher: z.string().nullable().optional(),
  fileName: z.string().optional(),
  duplicateGroupId: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;
export const claimSchema = z.object({
  id, projectId: id, statement: shortText, sourceId: id.nullable(),
  quote: z.string().max(10000), conditions: z.string().max(1000),
  status: z.enum(['unreviewed', 'supported', 'contradicted', 'insufficient']),
  reviewedBy: z.enum(['human', 'model', 'deterministic']).nullable(),
  subject: z.string().max(300),
  target: z.enum(['own', 'competitor', 'unresolved']).optional(),
  review: z.object({ sourceHash: id, quote: z.string(), at: z.string().datetime(), method: z.enum(['human', 'model']) }).optional(),
});
export type Claim = z.infer<typeof claimSchema>;
export const questionSchema = z.object({
  id, text: shortText, provenance: z.enum(['observed', 'reconstructed', 'hypothesis']),
  sourceIds: z.array(id), situation: z.string().optional(), need: z.string().optional(), painPoint: z.string().optional(),
  decisionCriteria: z.array(z.string()).optional(), modelIds: z.array(id).optional(),
});
export type CustomerQuestion = z.infer<typeof questionSchema>;
export const comparisonSchema = z.object({
  id, competitor: shortText, criterion: shortText, ownClaimIds: z.array(id),
  otherClaimIds: z.array(id), comparable: z.boolean(),
  verdict: z.enum(['advantage', 'common', 'unknown', 'weakness']),
  reason: z.string().max(3000),
  review: z.object({ conditions: shortText, asOf: z.string(), at: z.string().datetime(), evidenceRevision: z.number().int() }).optional(),
});
export type Comparison = z.infer<typeof comparisonSchema>;
export const recommendationSchema = z.object({
  id, situation: shortText, reason: shortText, claimIds: z.array(id),
  comparisonIds: z.array(id), limitation: z.string().max(3000),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
export const blockSchema = z.object({
  id, kind: z.enum(['heading', 'paragraph', 'bullet', 'cta', 'note']),
  text: z.string().max(25000), claimRefs: z.array(id), questionRefs: z.array(id).optional(), section: z.string().optional(),
});
export type DocumentBlock = z.infer<typeof blockSchema>;
export const documentSchema = z.object({
  id, channel: z.enum(channels), blocks: z.array(blockSchema),
  revision: z.number().int().nonnegative(), evidenceRevision: z.number().int().nonnegative(),
  reviewedBlocks: z.record(z.string(), z.string()).default({}),
  validationHash: z.string().nullable(),
  status: z.enum(['ready', 'needs_review', 'blocked', 'stale', 'outline']),
  warnings: z.array(z.string()), updatedAt: z.string().datetime(),
  inputRevision: z.number().int().optional(),
  insightRevision: z.number().int().optional(), briefHash: z.string().optional(), requestId: z.string().optional(),
  baseRevision: z.number().int().optional(),
  validation: z.object({ hash: id, rulesVersion: id, checkedAt: z.string().datetime(),
    semanticMethod: z.enum(['not_run', 'human', 'model']),
    issues: z.array(z.object({ blockId: id, message: z.string(), severity: z.enum(['block', 'review']) })),
  }).optional(),
});
export type ChannelDocument = z.infer<typeof documentSchema>;
export const projectSchema = z.object({
  schemaVersion: z.literal(2), id, ownerId: id, name: shortText, kind: z.enum(['brand', 'product', 'service']),
  brandId: id.nullable().default(null), brandName: z.string().max(300).default(''),
  category: categorySchema.default('unknown'),
  youtubePrefix: z.string().nullable().default(null), brandRuleRevision: z.number().int().nonnegative().default(0),
  model: z.string().max(300).default(''),
  description: z.string().max(1000), officialUrl: webUrl.or(z.literal('')),
  objective: objectiveSchema, audience: z.string().max(1000), audienceUndecided: z.boolean(),
  market: z.string().default('KR'), language: z.string().default('ko'),
  selectedChannels: z.array(z.enum(channels)).min(1), mode: z.enum(['manual', 'automatic']),
  inputRevision: z.number().int().nonnegative(), evidenceRevision: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  sources: z.array(sourceSchema), claims: z.array(claimSchema), questions: z.array(questionSchema),
  comparisons: z.array(comparisonSchema), recommendations: z.array(recommendationSchema),
  analysisHistory: z.array(z.object({ inputRevision: z.number().int(), evidenceRevision: z.number().int(), at: z.string().datetime(),
    questions: z.array(questionSchema), comparisons: z.array(comparisonSchema), recommendations: z.array(recommendationSchema),
    researchInsights: z.unknown().optional(),
  })).default([]),
  insight: z.object({ revision: z.number().int().nonnegative(), feedback: z.string().max(10000),
    approval: z.enum(['pending', 'approved', 'outline']), inputRevision: z.number().int(), evidenceRevision: z.number().int(),
    approvedAt: z.string().datetime().nullable(),
    feedbackHistory: z.array(z.object({ text: z.string(), at: z.string().datetime(), revision: z.number().int() })),
  }).default({ revision: 0, feedback: '', approval: 'pending', inputRevision: 0, evidenceRevision: 0,
    approvedAt: null, feedbackHistory: [] }),
  researchInsights: z.object({ questionClusters: z.array(z.object({ label: z.string(), questionIds: z.array(id) })),
    unmetNeeds: z.array(z.object({ situation: z.string(), need: z.string(), provenance: z.enum(['observed', 'reconstructed', 'hypothesis']), sourceIds: z.array(id) })),
    productCandidates: z.array(z.object({ name: z.string(), model: z.string(), category: z.string(), status: z.string() })),
    existingContent: z.array(z.object({ title: z.string(), url: z.string().nullable(), gap: z.string() })),
  }).default({ questionClusters: [], unmetNeeds: [], productCandidates: [], existingContent: [] }),
  questionAnswers: z.array(z.object({ id, questionId: id, answer: z.string(), claimIds: z.array(id),
    status: z.enum(['draft', 'reviewed']), revision: z.number().int(), updatedAt: z.string().datetime() })).default([]),
  publications: z.array(z.object({ id, channel: z.enum(channels), documentId: id, documentRevision: z.number().int(),
    documentHash: id, contentSnapshot: z.string(), url: webUrl, publishedAt: z.string().datetime(),
    verifiedAt: z.string().datetime().nullable(), status: z.enum(['reported', 'confirmed']) })).default([]),
  improvementTasks: z.array(z.object({ id, title: z.string(), reason: z.string(), questionIds: z.array(id),
    sourceIds: z.array(id), status: z.enum(['open', 'done']), createdAt: z.string().datetime() })).default([]),
  observations: z.array(z.object({ id, kind: z.enum(['prepublish', 'postpublish']),
    question: shortText, platform: shortText, model: z.string(), region: z.string(),
    at: z.string().datetime(), search: z.enum(['yes', 'no', 'unknown']),
    suppliedContent: z.boolean(), suppliedBrand: z.boolean(), sourceRevision: z.number().int().nullable(),
    status: z.enum(['failed', 'measured']), answer: z.string().max(50000), citedUrls: z.array(webUrl),
    mention: z.enum(['none', 'neutral', 'positive', 'negative']), recommended: z.boolean(),
    firstRecommended: z.boolean(), ownedCitation: z.boolean(), citationChecked: z.boolean(),
    note: z.string().max(2000),
  })).default([]),
  documents: z.partialRecord(z.enum(channels), documentSchema),
  documentHistory: z.partialRecord(z.enum(channels), z.array(documentSchema)).default({}),
  documentProposals: z.partialRecord(z.enum(channels), documentSchema).default({}),
  manualDrafts: z.object({ research: z.string().max(500000), content: z.string().max(500000) }).default({ research: '', content: '' }),
  contentRequestChannels: z.array(z.enum(channels)).default([]),
  importReceipts: z.array(z.object({ requestId: id, contract: z.string(), responseHash: id, at: z.string().datetime() })).default([]),
  missingEvidence: z.array(z.string()).default([]),
  manualResearchRequestId: z.string().nullable(), manualContentRequestId: z.string().nullable(),
  previousDraft: z.string().nullable(), migrationNote: z.string().nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof projectSchema>;

export function assertProjectRelations(project: Project): void {
  const sourceIds = new Set(project.sources.map(item => item.id));
  const claimIds = new Set(project.claims.map(item => item.id));
  const comparisonIds = new Set(project.comparisons.map(item => item.id));
  const questionIds = new Set(project.questions.map(item => item.id));
  const historicalQuestionIds = new Set([...questionIds, ...project.analysisHistory.flatMap(snapshot => snapshot.questions.map(q => q.id))]);
  if (sourceIds.size !== project.sources.length || claimIds.size !== project.claims.length ||
      comparisonIds.size !== project.comparisons.length ||
      new Set(project.questions.map(item => item.id)).size !== project.questions.length ||
      new Set(project.recommendations.map(item => item.id)).size !== project.recommendations.length) {
    throw new Error('자료 번호가 중복되어 작업을 저장할 수 없습니다.');
  }
  if (project.sources.some(item => item.projectId !== project.id) ||
      project.claims.some(item => item.projectId !== project.id || (item.sourceId && !sourceIds.has(item.sourceId))) ||
      project.questions.some(item => item.sourceIds.some(id => !sourceIds.has(id))) ||
      project.comparisons.some(item => [...item.ownClaimIds, ...item.otherClaimIds].some(id => !claimIds.has(id))) ||
      project.recommendations.some(item => item.claimIds.some(id => !claimIds.has(id)) ||
        item.comparisonIds.some(id => !comparisonIds.has(id))) ||
      project.researchInsights.questionClusters.some(item => item.questionIds.some(id => !questionIds.has(id))) ||
      project.researchInsights.unmetNeeds.some(item => item.sourceIds.some(id => !sourceIds.has(id))) ||
      project.questionAnswers.some(item => !historicalQuestionIds.has(item.questionId) || item.claimIds.some(id => !claimIds.has(id))) ||
      project.improvementTasks.some(item => item.sourceIds.some(id => !sourceIds.has(id))) ||
      Object.entries(project.documents).some(([channel, document]) => document &&
        (document.channel !== channel || document.blocks.some(block => block.claimRefs.some(id => !claimIds.has(id)) ||
          block.questionRefs?.some(id => !questionIds.has(id)))))) {
    throw new Error('다른 작업의 자료가 섞였거나 연결된 근거 번호가 없습니다.');
  }
}

export const researchImportSchema = z.object({
  contract: z.literal('alc.research.v1'), requestId: id,
  entity: z.object({ name: shortText }),
  sources: z.array(z.object({
    ref: id, title: shortText, url: webUrl.nullable(), excerpt: z.string().max(50000),
    sourceType: z.enum(['official', 'test', 'independent', 'review', 'user']).default('user'),
    publisher: z.string().nullable().optional(), publishedAt: z.string().nullable().optional(),
  })),
  claims: z.array(z.object({
    ref: id, statement: shortText, sourceRef: id.nullable(), quote: z.string().max(10000),
    conditions: z.string().max(1000).default(''), subject: z.string().max(300).default(''),
  })),
  questions: z.array(z.object({
    ref: id, text: shortText, provenance: z.enum(['observed', 'reconstructed', 'hypothesis']).default('hypothesis'),
    sourceRefs: z.array(id).default([]),
  })),
  comparisons: z.array(z.object({
    ref: id, competitor: shortText, criterion: shortText,
    ownClaimRefs: z.array(id), otherClaimRefs: z.array(id), comparable: z.boolean(),
    // External AI often uses these two equivalent labels. Its verdict is still
    // discarded until both sides' original evidence and conditions are reviewed.
    verdict: z.enum(['advantage', 'common', 'unknown', 'weakness', 'own_advantage', 'competitor_advantage'])
      .transform(value => value === 'own_advantage' ? 'advantage' as const : value === 'competitor_advantage' ? 'weakness' as const : value),
    reason: z.string().max(3000),
  })),
  recommendations: z.array(z.object({
    ref: id, situation: shortText, reason: shortText, claimRefs: z.array(id),
    comparisonRefs: z.array(id).default([]), limitation: z.string().max(3000).default(''),
  })),
  missingEvidence: z.array(z.string()),
});
export type ResearchImport = z.infer<typeof researchImportSchema>;
export const researchV2Schema = researchImportSchema.extend({
  contract: z.literal('alc.research.v2'),
  questions: z.array(researchImportSchema.shape.questions.element.extend({
    situation: z.string().default(''), need: z.string().default(''), painPoint: z.string().default(''),
    decisionCriteria: z.array(z.string()).default([]),
  })),
  questionClusters: z.array(z.object({ label: z.string(), questionRefs: z.array(id) })).default([]),
  unmetNeeds: z.array(z.object({ situation: z.string(), need: z.string(), provenance: z.enum(['observed', 'reconstructed', 'hypothesis']), sourceRefs: z.array(id) })).default([]),
  productCandidates: z.array(z.object({ name: z.string(), model: z.string(), category: z.string(), status: z.string() })).default([]),
  existingContent: z.array(z.object({ title: z.string(), url: webUrl.nullable(), gap: z.string() })).default([]),
});
export type ResearchV2Import = z.infer<typeof researchV2Schema>;
export const contentImportSchema = z.object({
  contract: z.literal('alc.content.v1'), requestId: id,
  documents: z.array(z.object({
    channel: z.enum(channels), blocks: z.array(z.object({
      kind: z.enum(['heading', 'paragraph', 'bullet', 'cta', 'note']),
      text: z.string().trim().min(1).max(25000), claimRefs: z.array(id).default([]),
    })).min(1),
  })),
  unresolvedItems: z.array(z.string()),
});
export type ContentImport = z.infer<typeof contentImportSchema>;
export const contentV2Schema = contentImportSchema.extend({
  contract: z.literal('alc.content.v2'),
  inputRevision: z.number().int(), evidenceRevision: z.number().int(), insightRevision: z.number().int(),
  documents: z.array(contentImportSchema.shape.documents.element.extend({
    blocks: z.array(contentImportSchema.shape.documents.element.shape.blocks.element.extend({
      questionRefs: z.array(id).default([]), section: z.string().default(''),
    })).min(1),
  })),
});

export function newProject(input: Pick<Project, 'name' | 'kind' | 'description' | 'officialUrl' | 'objective' | 'audience' | 'audienceUndecided' | 'selectedChannels' | 'mode'> & { model?: string; brandId?: string | null; brandName?: string; category?: ProductCategory; youtubePrefix?: string | null; brandRuleRevision?: number }): Project {
  const now = new Date().toISOString();
  return projectSchema.parse({
    ...input, schemaVersion: 2, id: crypto.randomUUID(), ownerId: 'local', market: 'KR', language: 'ko',
    inputRevision: 1, evidenceRevision: 0, revision: 0,
    sources: [], claims: [], questions: [], comparisons: [], recommendations: [], documents: {}, documentHistory: {},
    manualResearchRequestId: null, manualContentRequestId: null,
    previousDraft: null, migrationNote: null, createdAt: now, updatedAt: now,
  });
}
