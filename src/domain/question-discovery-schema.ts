import { z } from 'zod';
const id = z.string().min(1).max(300);
const text = z.string().max(5000);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const consumerLinkSchema = z.object({
  sourceId: id, snapshotId: id, sourceDigest: digest, linkedAt: z.string().datetime(),
  incidentId: id, independence: z.enum(['declared', 'unknown']), independenceNote: z.string().max(2000),
  brand: z.string().max(300), privacyReviewed: z.boolean(), privacyNote: z.string().max(2000),
  permissionReview: z.object({ at: z.string().datetime(), note: z.string().min(10).max(2000),
    externalAiAllowed: z.boolean(), publicationAllowed: z.boolean() }).optional(),
});
export const discoveryQuoteSchema = z.object({ rowId: id, quote: text.min(1), start: z.number().int().nonnegative(),
  end: z.number().int().positive(), role: z.enum(['support', 'counter']) });
const contextField = z.object({ text, basis: z.enum(['quote', 'interpretation', 'unknown']), evidenceIndexes: z.array(z.number().int().nonnegative()).max(20) });
export const discoveryProposalSchema = z.object({
  ref: id, text: text.min(1), provenance: z.enum(['observed', 'reconstructed', 'hypothesis']),
  evidence: z.array(discoveryQuoteSchema).max(40), reason: text.min(1), alternativeInterpretations: z.array(text.min(1)).min(1).max(10),
  context: z.object({ situation: contextField, task: contextField, barrier: contextField, expectedOutcome: contextField }),
  unmetNeed: z.enum(['unknown', 'explicit_barrier', 'resolved', 'conflicting']),
  decisionImpact: z.enum(['unknown', 'low', 'medium', 'high']), impactReason: text,
}).strict();
export const rowDispositionSchema = z.object({ rowId: id, status: z.enum(['linked', 'no_candidate', 'ambiguous']),
  questionRefs: z.array(id).max(12), reason: text.min(1) });
const candidateReviewSchema = z.object({ at: z.string().datetime(), method: z.literal('human-only'), decision: z.enum(['accepted', 'rejected']), note: text.min(10),
  candidateHash: digest, inputHash: digest });
export const discoveryResponseSchema = z.object({
  contract: z.literal('alc.question-discovery.v1'), runId: id, inputHash: digest,
  questions: z.array(discoveryProposalSchema).max(12), rowDispositions: z.array(rowDispositionSchema).max(100),
}).strict();
export const discoveryCandidateSchema = discoveryProposalSchema.extend({
  id, runId: id, attemptId: id, status: z.enum(['review_required', 'accepted', 'held', 'rejected', 'stale']),
  holdReasons: z.array(text),
  review: candidateReviewSchema.optional(), reviewHistory: z.array(candidateReviewSchema).default([]),
});
export const discoveryManifestRowSchema = z.object({
  rowId: id, datasetId: id, sourceId: id, snapshotId: id, sourceDigest: digest,
  text: text.min(1), channel: z.string().max(300), sourceUrl: z.url().refine(s => /^https?:\/\//.test(s)), publishedAt: z.string().nullable(),
  incidentId: id, independence: z.enum(['declared', 'unknown']), brand: z.string().max(300),
  audit: z.string().max(15000),
});
export const discoveryRunSchema = z.object({
  id, projectId: id, parentRunId: id.nullable(), mode: z.literal('manual_external'),
  provider: z.string().min(1).max(300), model: z.string().min(1).max(300), modelVersion: z.string().max(300),
  modelProvenance: z.enum(['user_reported', 'unknown']), createdAt: z.string().datetime(),
  selectedRowIds: z.array(id).max(100), order: z.enum(['forward', 'reverse', 'hash_order']),
  manifest: z.array(discoveryManifestRowSchema).max(100), excluded: z.array(z.object({ rowId: id, reasons: z.array(text) })),
  currentInputHash: digest, configurationHash: digest, input: z.string().max(45000), inputHash: digest,
  prompt: z.string().max(60000), promptHash: digest, rulesVersion: z.literal('alc.discovery.1'),
  responseDraft: z.string().max(500000).default(''),
  status: z.enum(['prepared', 'awaiting_response', 'review_required', 'held', 'stale', 'cancelled']),
  events: z.array(z.object({ at: z.string().datetime(), status: z.string(), reason: text })),
  attempts: z.array(z.object({ id, raw: z.string().max(500000), responseHash: digest,
    at: z.string().datetime(), status: z.enum(['invalid', 'review_required', 'held']),
    errors: z.array(text), rowDispositions: z.array(rowDispositionSchema) })),
});
export type ConsumerEvidenceLink = z.infer<typeof consumerLinkSchema>;
export type DiscoveryProposal = z.infer<typeof discoveryProposalSchema>;
export type DiscoveryCandidate = z.infer<typeof discoveryCandidateSchema>;
export type DiscoveryRun = z.infer<typeof discoveryRunSchema>;
export type DiscoveryManifestRow = z.infer<typeof discoveryManifestRowSchema>;
