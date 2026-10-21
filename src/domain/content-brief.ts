import { z } from 'zod';
import { buildStrategy, comparisonAssessment } from './analysis/strategy';
import { insightCurrent } from './insight';
import { channels, type Channel, type Project } from './schema';
import { fingerprint } from './text';

const briefSchema = z.object({
  contract: z.literal('alc.brief.v1'), projectId: z.string(), requestId: z.string(),
  inputRevision: z.number(), evidenceRevision: z.number(), insightRevision: z.number(),
  brandRuleRevision: z.number(), evidenceHash: z.string(),
  entity: z.object({ name: z.string(), model: z.string(), brandName: z.string(), category: z.string(),
    youtubePrefix: z.string().nullable(), officialUrl: z.string(), market: z.string(), language: z.string() }),
  objective: z.string(), audience: z.object({ text: z.string(), confirmed: z.boolean() }),
  userDescription: z.object({ text: z.string(), state: z.literal('user_assertion') }),
  questions: z.array(z.object({ id: z.string(), text: z.string(), provenance: z.string(), situation: z.string(),
    need: z.string(), painPoint: z.string(), decisionCriteria: z.array(z.string()) })),
  allowedClaims: z.array(z.object({ id: z.string(), statement: z.string(), subject: z.string(), conditions: z.string(),
    quote: z.string(), sourceTitle: z.string(), sourceUrl: z.string().nullable(), publishedAt: z.string().nullable(),
    sourceType: z.string(), sourceHash: z.string() })),
  comparisons: z.array(z.object({ competitor: z.string(), criterion: z.string(), state: z.string(),
    reason: z.string(), conditions: z.string() })),
  recommendations: z.array(z.object({ situation: z.string(), reason: z.string(), limitation: z.string(), claimIds: z.array(z.string()) })),
  gaps: z.array(z.string()),
  feedback: z.object({ text: z.string(), state: z.literal('direction_only'), revision: z.number() }),
  outline: z.boolean(),
  channels: z.array(z.object({ channel: z.enum(channels), purpose: z.string(), structure: z.string(), guard: z.string(),
    questions: z.array(z.string()), claimIds: z.array(z.string()) })),
});
export type ContentBrief = z.infer<typeof briefSchema>;

export function buildContentBrief(project: Project, requestId: string, selected: Channel[]): ContentBrief {
  if (!insightCurrent(project)) throw new Error('핵심 인사이트의 현재 버전을 확인한 뒤 작성 요청문을 만들어 주세요.');
  const strategy = buildStrategy(project);
  const allowedClaims = strategy.eligible.filter(c => project.sources.some(s => s.id === c.sourceId && s.externalAiAllowed))
    .map(claim => { const source = project.sources.find(s => s.id === claim.sourceId)!;
      return { id: claim.id, statement: claim.statement, subject: claim.subject, conditions: claim.conditions,
        quote: claim.quote, sourceTitle: source.title, sourceUrl: source.url, publishedAt: source.publishedAt,
        sourceType: source.sourceType, sourceHash: source.hash }; });
  const allowedIds = new Set(allowedClaims.map(c => c.id));
  const reviewed = project.comparisons.map(item => ({ item, check: comparisonAssessment(project, item) }));
  const comparisons = reviewed.map(({ item, check }) => ({ competitor: item.competitor, criterion: item.criterion,
    state: check.reviewed ? check.label : '비교 미확인', reason: check.reviewed ? item.reason : check.reason,
    conditions: check.reviewed ? item.review?.conditions || '' : '' }));
  const questions = project.questions.map(q => ({ id: q.id, text: q.text, provenance: q.provenance,
    situation: q.situation || '', need: q.need || '', painPoint: q.painPoint || '', decisionCriteria: q.decisionCriteria || [] }));
  const base = { contract: 'alc.brief.v1' as const, projectId: project.id, requestId,
    inputRevision: project.inputRevision, evidenceRevision: project.evidenceRevision,
    insightRevision: project.insight.revision, brandRuleRevision: project.brandRuleRevision,
    evidenceHash: fingerprint(JSON.stringify(allowedClaims.map(c => [c.id, c.sourceHash, c.conditions]))),
    entity: { name: project.name, model: project.model, brandName: project.brandName, category: project.category,
      youtubePrefix: project.youtubePrefix, officialUrl: project.officialUrl, market: project.market, language: project.language },
    objective: project.objective, audience: { text: project.audience, confirmed: !project.audienceUndecided },
    userDescription: { text: project.description, state: 'user_assertion' as const }, questions, allowedClaims,
    comparisons, recommendations: strategy.candidates.filter(r => r.usable && r.candidate.claimIds.every(id => allowedIds.has(id)))
      .map(r => ({ situation: r.candidate.situation, reason: r.candidate.reason, limitation: r.candidate.limitation,
        claimIds: r.candidate.claimIds })),
    gaps: [...new Set([...strategy.gaps, ...project.missingEvidence])],
    feedback: { text: project.insight.feedback, state: 'direction_only' as const, revision: project.insight.revision },
    outline: project.insight.approval === 'outline',
    channels: strategy.plans.filter(p => selected.includes(p.channel)).map(p => ({ channel: p.channel, purpose: p.purpose,
      structure: p.structure, guard: p.guard, questions: questions.map(q => q.text), claimIds: p.claimIds.filter(id => allowedIds.has(id)) })),
  };
  return briefSchema.parse(base);
}
