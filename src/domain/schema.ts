import { z } from 'zod';

export const channels = ['ad_copy', 'product_page', 'press_release', 'youtube_description', 'blog', 'review_video'] as const;
export type Channel = (typeof channels)[number];
export const channelNames: Record<Channel, string> = {
  ad_copy: '광고카피', product_page: '상세페이지', press_release: '보도자료',
  youtube_description: '유튜브 설명', blog: '블로그', review_video: '후기 영상 핵심 문구',
};
const id = z.string().min(1);
const shortText = z.string().trim().min(1).max(5000);
export const objectiveSchema = z.enum(['sales', 'feature', 'trust']);
export type Objective = z.infer<typeof objectiveSchema>;
export const sourceSchema = z.object({
  id, projectId: id, title: shortText, url: z.string().url().nullable(),
  excerpt: z.string().max(50000), body: z.string().max(300000),
  sourceType: z.enum(['official', 'test', 'independent', 'review', 'user']),
  retrieval: z.enum(['fetched', 'user_provided', 'failed', 'partial']),
  origin: z.enum(['direct_input', 'external_response', 'fetched']),
  publishedAt: z.string().nullable(), collectedAt: z.string().datetime(),
  externalAiAllowed: z.boolean(), publicationAllowed: z.boolean(),
  hash: id,
});
export type Source = z.infer<typeof sourceSchema>;
export const claimSchema = z.object({
  id, projectId: id, statement: shortText, sourceId: id.nullable(),
  quote: z.string().max(10000), conditions: z.string().max(1000),
  status: z.enum(['unreviewed', 'supported', 'contradicted', 'insufficient']),
  reviewedBy: z.enum(['human', 'model', 'deterministic']).nullable(),
  subject: z.string().max(300),
});
export type Claim = z.infer<typeof claimSchema>;
export const questionSchema = z.object({
  id, text: shortText, provenance: z.enum(['observed', 'reconstructed', 'hypothesis']),
  sourceIds: z.array(id),
});
export type CustomerQuestion = z.infer<typeof questionSchema>;
export const comparisonSchema = z.object({
  id, competitor: shortText, criterion: shortText, ownClaimIds: z.array(id),
  otherClaimIds: z.array(id), comparable: z.boolean(),
  verdict: z.enum(['advantage', 'common', 'unknown', 'weakness']),
  reason: z.string().max(3000),
});
export type Comparison = z.infer<typeof comparisonSchema>;
export const recommendationSchema = z.object({
  id, situation: shortText, reason: shortText, claimIds: z.array(id),
  comparisonIds: z.array(id), limitation: z.string().max(3000),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
export const blockSchema = z.object({
  id, kind: z.enum(['heading', 'paragraph', 'bullet', 'cta', 'note']),
  text: z.string().max(25000), claimRefs: z.array(id),
});
export type DocumentBlock = z.infer<typeof blockSchema>;
export const documentSchema = z.object({
  id, channel: z.enum(channels), blocks: z.array(blockSchema),
  revision: z.number().int().nonnegative(), evidenceRevision: z.number().int().nonnegative(),
  validationHash: z.string().nullable(),
  status: z.enum(['ready', 'needs_review', 'blocked', 'stale', 'outline']),
  warnings: z.array(z.string()), updatedAt: z.string().datetime(),
});
export type ChannelDocument = z.infer<typeof documentSchema>;
export const projectSchema = z.object({
  schemaVersion: z.literal(2), id, ownerId: id, name: shortText, kind: z.enum(['brand', 'product', 'service']),
  description: z.string().max(1000), officialUrl: z.string().url().or(z.literal('')),
  objective: objectiveSchema, audience: z.string().max(1000), audienceUndecided: z.boolean(),
  market: z.string().default('KR'), language: z.string().default('ko'),
  selectedChannels: z.array(z.enum(channels)).min(1), mode: z.enum(['manual', 'automatic']),
  inputRevision: z.number().int().nonnegative(), evidenceRevision: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  sources: z.array(sourceSchema), claims: z.array(claimSchema), questions: z.array(questionSchema),
  comparisons: z.array(comparisonSchema), recommendations: z.array(recommendationSchema),
  documents: z.partialRecord(z.enum(channels), documentSchema),
  manualResearchRequestId: z.string().nullable(), manualContentRequestId: z.string().nullable(),
  previousDraft: z.string().nullable(), migrationNote: z.string().nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof projectSchema>;

export const researchImportSchema = z.object({
  contract: z.literal('alc.research.v1'), requestId: id,
  entity: z.object({ name: shortText }),
  sources: z.array(z.object({
    ref: id, title: shortText, url: z.string().url().nullable(), excerpt: z.string().max(50000),
    sourceType: z.enum(['official', 'test', 'independent', 'review', 'user']).default('user'),
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
    verdict: z.enum(['advantage', 'common', 'unknown', 'weakness']), reason: z.string().max(3000),
  })),
  recommendations: z.array(z.object({
    ref: id, situation: shortText, reason: shortText, claimRefs: z.array(id),
    comparisonRefs: z.array(id).default([]), limitation: z.string().max(3000).default(''),
  })),
  missingEvidence: z.array(z.string()),
});
export type ResearchImport = z.infer<typeof researchImportSchema>;
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

export function newProject(input: Pick<Project, 'name' | 'kind' | 'description' | 'officialUrl' | 'objective' | 'audience' | 'audienceUndecided' | 'selectedChannels' | 'mode'>): Project {
  const now = new Date().toISOString();
  return projectSchema.parse({
    ...input, schemaVersion: 2, id: crypto.randomUUID(), ownerId: 'local', market: 'KR', language: 'ko',
    inputRevision: 1, evidenceRevision: 0, revision: 0,
    sources: [], claims: [], questions: [], comparisons: [], recommendations: [], documents: {},
    manualResearchRequestId: null, manualContentRequestId: null,
    previousDraft: null, migrationNote: null, createdAt: now, updatedAt: now,
  });
}
